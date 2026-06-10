import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createAndCompleteReturnOrderWorkflow } from "@medusajs/core-flows"
import { returnRequestLimiter, enforceRateLimit } from "../../../lib/rate-limiter"

type ReturnItemInput = {
  id: string // order line item id
  quantity: number
  reason_id?: string | null
  note?: string | null
}

/**
 * POST /store/return-requests
 *
 * Giriş yapmış müşterinin kendi siparişi için iade talebi oluşturur. Native Medusa
 * `createAndCompleteReturnOrderWorkflow`'u çağırır → iade kaydı "requested" olur,
 * `order.return_requested` event'i ile müşteriye "İade Talebiniz Alındı" maili gider.
 * Admin panelden teslim alındığında stok otomatik geri eklenir.
 *
 * Body: { order_id, items: [{ id, quantity, reason_id? }], note? }
 *
 * NOT: Bu özel route core `POST /store/returns`'ün yerini tutar; çünkü o uç cart_id
 * gerektiren `is_return` shipping option çözümünü istemcide zorunlu kılıyor. Burada
 * iade kargo seçeneğini sunucu tarafında çözer ve siparişin müşteriye ait olduğunu doğrularız.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(returnRequestLimiter, req, res)) return

  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "İade talebi için giriş yapmalısınız." })
  }

  const body = (req.body ?? {}) as {
    order_id?: string
    items?: ReturnItemInput[]
    note?: string
  }
  const orderId = body.order_id
  const items = (body.items ?? []).filter((i) => i?.id && Number(i.quantity) > 0)

  if (!orderId || !items.length) {
    return res
      .status(400)
      .json({ message: "Geçerli bir sipariş ve en az bir iade ürünü gereklidir." })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Sipariş gerçekten bu müşteriye mi ait? (IDOR koruması)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "items.id", "items.quantity"],
    filters: { id: orderId },
  })
  const order = orders?.[0]
  if (!order || order.customer_id !== customerId) {
    return res.status(404).json({ message: "Sipariş bulunamadı." })
  }

  // İstenen kalemler siparişte var mı ve miktar aşılmıyor mu?
  const orderItemMap = new Map<string, number>(
    (order.items || []).map((i: any) => [String(i.id), Number(i.quantity)])
  )
  for (const it of items) {
    const maxQty = orderItemMap.get(it.id)
    if (maxQty == null) {
      return res.status(400).json({ message: "İade kalemi siparişte bulunamadı." })
    }
    if (Number(it.quantity) > maxQty) {
      return res
        .status(400)
        .json({ message: "İade miktarı sipariş miktarını aşamaz." })
    }
  }

  // 2. İade kargo seçeneğini sunucu tarafında çöz (is_return=true kuralı olan option).
  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "rules.attribute", "rules.value"],
  })
  const returnOption = shippingOptions.find((o: any) =>
    (o.rules || []).some(
      (r: any) => r.attribute === "is_return" && String(r.value) === "true"
    )
  )
  if (!returnOption) {
    return res.status(500).json({
      message:
        "İade kargo seçeneği bulunamadı. Lütfen daha sonra tekrar deneyin (yönetici: npm run setup:returns).",
    })
  }

  // 3. Stok lokasyonunu çöz (iade teslim alınınca stok BURAYA geri eklenir;
  //    location_id verilmezse confirm-receive restock adımı hata verir).
  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  })
  const locationId = stockLocations?.[0]?.id

  // 4. Native iade workflow'unu çalıştır.
  try {
    const { result } = await createAndCompleteReturnOrderWorkflow(req.scope).run({
      input: {
        order_id: orderId,
        items: items.map((i) => ({
          id: i.id,
          quantity: Number(i.quantity),
          reason_id: i.reason_id || undefined,
          note: i.note || undefined,
        })),
        return_shipping: { option_id: returnOption.id },
        location_id: locationId,
        note: body.note || undefined,
      } as any,
    })

    // createAndComplete location_id'yi yalnız iade fulfillment'ına yazıyor; return
    // KAYDININ location_id'sini ayrıca set etmezsek admin "teslim al/onayla" (confirm-receive)
    // "Cannot receive the Return at location null" ile patlıyor ve stok geri eklenmiyor.
    if (locationId && (result as any)?.id) {
      try {
        const orderModule = req.scope.resolve(Modules.ORDER)
        await orderModule.updateReturns((result as any).id, { location_id: locationId })
      } catch {
        // location set edilemese bile iade oluştu; admin elle lokasyon seçebilir.
      }
    }

    return res.status(200).json({ return: result })
  } catch (e: any) {
    return res
      .status(400)
      .json({ message: e?.message || "İade talebi oluşturulamadı." })
  }
}
