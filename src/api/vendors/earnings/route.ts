import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"

/**
 * GET /vendors/earnings — satıcının kazanç özeti.
 * Tutarlar minor unit (kuruş). Bakiye = ödenmemiş (pending) alt-siparişlerin
 * seller_earning toplamı.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  // Özet için tüm alt-siparişleri çek (satıcı başına sayı makul; gerekirse
  // ileride DB-agregasyonuna geçilir).
  const all = await marketplace.listSellerOrders(
    { seller_id: resolved.seller.id },
    { order: { created_at: "DESC" }, take: 1000 }
  )

  const sum = (arr: any[], k: string) => arr.reduce((s, x) => s + Number(x[k] ?? 0), 0)
  // Net kazanç = seller_earning - returned_earning - cargo_fee (iade + kargo düşülmüş).
  const net = (arr: any[]) =>
    arr.reduce(
      (s, x) =>
        s + (Number(x.seller_earning ?? 0) - Number(x.returned_earning ?? 0) - Number(x.cargo_fee ?? 0)),
      0
    )
  const pending = all.filter((o: any) => o.payout_status === "pending")
  const eligible = all.filter((o: any) => o.payout_status === "eligible")
  const paid = all.filter((o: any) => o.payout_status === "paid")

  const summary = {
    currency_code: (all[0] as any)?.currency_code || "try",
    gross_sales: sum(all, "subtotal"),
    total_commission: sum(all, "commission_amount"),
    total_returned: sum(all, "returned_subtotal"),
    total_cargo_fee: sum(all, "cargo_fee"),
    total_earning: net(all),
    pending_balance: net(pending), // hakediş bekleyen (kargo sonrası bekleme süresi)
    eligible_balance: net(eligible), // ödenebilir (hakediş etti, ödeme bekliyor)
    paid_total: net(paid),
    order_count: all.length,
  }

  // Son 20 alt-sipariş (kazanç dökümü)
  const recent = all.slice(0, 20).map((o: any) => ({
    id: o.id,
    display_id: o.display_id,
    created_at: o.created_at,
    subtotal: o.subtotal,
    commission_amount: o.commission_amount,
    returned_earning: o.returned_earning,
    cargo_fee: o.cargo_fee,
    seller_earning:
      Number(o.seller_earning ?? 0) - Number(o.returned_earning ?? 0) - Number(o.cargo_fee ?? 0),
    payout_status: o.payout_status,
    fulfillment_status: o.fulfillment_status,
  }))

  return res.json({ summary, recent })
}
