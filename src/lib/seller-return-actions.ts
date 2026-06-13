import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  receiveAndCompleteReturnOrderWorkflow,
  cancelReturnWorkflow,
} from "@medusajs/core-flows"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { refundOrderAmount } from "./refund-order"
import { sendReturnStatusEmail } from "./return-mail"
import { routeReturnReceived } from "./process-return"
import { recordReturnStockMovements } from "./return-stock-audit"

const num = (v: any) => Number(v ?? 0)

export type SellerReturnRow = {
  id: string
  seller_id: string
  return_id: string
  order_id: string
  status: string
  returned_subtotal?: number
}

/**
 * Satıcı (veya hakem admin) iadeyi TESLİM ALIP ONAYLAR:
 *  1) native return'ü teslim al + tamamla → restock + `order.return_received` event'i
 *     (→ routeReturnReceived: seller_return "received" + komisyon/kazanç clawback;
 *        return-stock: stok hareketi; return-received: müşteriye "onaylandı" maili).
 *  2) müşteriye OTOMATİK para iadesi (returned_subtotal, iade-edilebilir bakiyeye kıstırılmış).
 *
 * Her native return tek satıcılı olduğundan tüm kalemleri tam miktarla teslim alır.
 * status "requested" veya (hakem) "rejected" iken çağrılabilir.
 */
export async function acceptSellerReturn(
  container: any,
  sellerReturn: SellerReturnRow
): Promise<{ refunded: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: returns } = await query.graph({
    entity: "return",
    fields: ["id", "status", "items.item_id", "items.quantity"],
    filters: { id: sellerReturn.return_id },
  })
  const ret = returns?.[0] as any
  if (!ret) throw new Error("İade kaydı bulunamadı.")

  const items = (ret.items || [])
    .filter((i: any) => i?.item_id && num(i.quantity) > 0)
    .map((i: any) => ({ id: i.item_id, quantity: num(i.quantity) }))
  if (!items.length) throw new Error("Teslim alınacak kalem yok.")

  // 1) native return'ü teslim al + tamamla (managed-inventory stoğu OTOMATİK geri ekler)
  await receiveAndCompleteReturnOrderWorkflow(container).run({
    input: { return_id: sellerReturn.return_id, items } as any,
  })

  // 2) clawback + seller_return "received" — DOĞRUDAN (idempotent). order.return_received
  //    event'i bu workflow'da subscriber'lara ulaşmadığı için event'e GÜVENMİYORUZ;
  //    muhasebe kritik olduğundan senkron uyguluyoruz.
  await routeReturnReceived(container, sellerReturn.return_id)

  // 2b) stok hareketi denetim kaydı (best-effort; stok seviyesi zaten geri eklendi)
  await recordReturnStockMovements(container, sellerReturn.return_id)

  // 3) otomatik para iadesi (bakiye guard'lı; ödenmemiş/iade edilmiş siparişte atlanır)
  const subtotal = num(sellerReturn.returned_subtotal)
  const result = await refundOrderAmount(
    container,
    sellerReturn.order_id,
    subtotal > 0 ? subtotal : undefined
  )

  // 4) müşteriye "iadeniz onaylandı" maili (best-effort; event'e güvenmiyoruz)
  try {
    await sendReturnStatusEmail(container, sellerReturn.return_id, "received")
  } catch (e: any) {
    container.resolve("logger").error(`[seller-return:accept] mail: ${e?.message}`)
  }

  return { refunded: result.refunded }
}

/**
 * Satıcı iadeyi REDDEDER: seller_return "rejected" + gerekçe; müşteriye ret maili.
 * Native return AÇIK kalır (admin hakem olarak satıcı adına kabul edebilir).
 * Stok/clawback/para iadesi YAPILMAZ.
 */
export async function rejectSellerReturn(
  container: any,
  sellerReturn: SellerReturnRow,
  reason?: string | null
): Promise<void> {
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  await marketplace.updateSellerReturns({
    id: sellerReturn.id,
    status: "rejected",
    reject_reason: reason || null,
    rejected_at: new Date(),
  } as any)

  try {
    await sendReturnStatusEmail(container, sellerReturn.return_id, "rejected", { reason })
  } catch (e: any) {
    container.resolve("logger").error(`[seller-return:reject] mail: ${e?.message}`)
  }
}

/**
 * Admin hakem reddi ONAYLAR: para iadesi/stok/clawback YOK; seller_return "rejected"
 * kalır (kaynak doğruluk SellerReturn'dür; storefront native return göstermez).
 *
 * Native return'ü iptal etmeyi BEST-EFFORT dener: teslim edilmiş siparişlerde
 * Medusa "All fulfillments must be canceled before canceling a return" hatası verir
 * (tüm gerçek iadeler teslim edilmiş kalemler içindir) → bu durumda native return
 * AÇIK bırakılır (zararsız; admin sonradan fikir değiştirip kabul edebilir).
 */
export async function upholdRejectSellerReturn(
  container: any,
  sellerReturn: SellerReturnRow
): Promise<void> {
  try {
    await cancelReturnWorkflow(container).run({
      input: { return_id: sellerReturn.return_id } as any,
    })
  } catch (e: any) {
    container.resolve("logger").info(
      `[uphold-reject] native return iptal edilemedi (açık bırakıldı): ${e?.message}`
    )
  }
}
