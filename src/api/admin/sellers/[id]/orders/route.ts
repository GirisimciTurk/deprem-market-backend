import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"

/**
 * GET /admin/sellers/:id/orders?payout=&limit=&offset=
 * Bir satıcının alt-siparişleri + ödeme (payout) özeti. Admin payout yönetimi.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const payout = req.query.payout as string | undefined

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const filters: Record<string, unknown> = { seller_id: sellerId }
  if (payout && ["pending", "eligible", "paid"].includes(payout)) filters.payout_status = payout

  const [orders, count] = await marketplace.listAndCountSellerOrders(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Ödeme özeti (tüm alt-siparişler üzerinden). Net = kazanç - iade.
  const all = await marketplace.listSellerOrders(
    { seller_id: sellerId, fulfillment_status: { $ne: "canceled" } },
    { take: 1000 }
  )
  const sum = (arr: any[], k: string) => arr.reduce((s, x) => s + Number(x[k] ?? 0), 0)
  const net = (arr: any[]) => arr.reduce((s, x) => s + Math.max(0, Number(x.seller_earning ?? 0) - Number(x.returned_earning ?? 0) - Number(x.cargo_fee ?? 0)), 0)
  // pending = henüz hakediş etmedi (bekliyor); eligible = ödenebilir; paid = ödendi.
  const pending = all.filter((o: any) => o.payout_status === "pending")
  const eligible = all.filter((o: any) => o.payout_status === "eligible")
  const summary = {
    currency_code: (all[0] as any)?.currency_code || "try",
    total_earning: net(all),
    total_commission: sum(all, "commission_amount"),
    total_returned: sum(all, "returned_subtotal"),
    total_cargo_fee: sum(all, "cargo_fee"),
    pending_balance: net(pending), // hakediş bekleyen
    eligible_balance: net(eligible), // ödenebilir (hakediş etti)
    paid_total: net(all.filter((o: any) => o.payout_status === "paid")),
  }

  return res.json({ orders, count, offset, limit, summary })
}
