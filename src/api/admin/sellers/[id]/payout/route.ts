import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"

const schema = z.object({
  // Belirli alt-siparişler; verilmezse satıcının TÜM bekleyen ödemeleri işaretlenir.
  order_ids: z.array(z.string()).optional(),
})

/**
 * POST /admin/sellers/:id/payout  { order_ids?: string[] }
 * Manuel payout: satıcının HAKEDİŞ ETMİŞ (eligible) alt-siparişlerini "ödendi"
 * yapar. Henüz hakediş etmemiş (pending) kayıtlar ödenemez. Banka transferi
 * sistem dışında yapılır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const filters: Record<string, unknown> = {
    seller_id: sellerId,
    payout_status: "eligible",
    fulfillment_status: { $ne: "canceled" },
  }
  if (parsed.data.order_ids?.length) filters.id = parsed.data.order_ids

  const pending = await marketplace.listSellerOrders(filters, { take: 1000 })
  if (pending.length === 0) {
    return res.json({ paid_count: 0, paid_amount: 0, message: "Hakediş etmiş (ödenebilir) kayıt yok." })
  }

  const paidAt = new Date()
  await marketplace.updateSellerOrders(
    pending.map((o: any) => ({ id: o.id, payout_status: "paid", paid_at: paidAt })) as any
  )

  // Net ödenen = seller_earning - returned_earning - cargo_fee (iade + kargo düşülmüş).
  // Per-sipariş max(0,...): bir siparişin negatifi (tam iade + kargo) başka siparişin
  // ödemesini eksiltmesin.
  const paid_amount = pending.reduce(
    (s: number, o: any) =>
      s + Math.max(0, Number(o.seller_earning ?? 0) - Number(o.returned_earning ?? 0) - Number(o.cargo_fee ?? 0)),
    0
  )
  return res.json({ paid_count: pending.length, paid_amount })
}
