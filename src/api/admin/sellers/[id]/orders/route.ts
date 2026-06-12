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
  if (payout && ["pending", "paid"].includes(payout)) filters.payout_status = payout

  const [orders, count] = await marketplace.listAndCountSellerOrders(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Ödeme özeti (tüm alt-siparişler üzerinden).
  const all = await marketplace.listSellerOrders({ seller_id: sellerId }, { take: 1000 })
  const sum = (arr: any[], k: string) => arr.reduce((s, x) => s + Number(x[k] ?? 0), 0)
  const pending = all.filter((o: any) => o.payout_status === "pending")
  const summary = {
    currency_code: (all[0] as any)?.currency_code || "try",
    total_earning: sum(all, "seller_earning"),
    total_commission: sum(all, "commission_amount"),
    pending_balance: sum(pending, "seller_earning"),
    paid_total: sum(all.filter((o: any) => o.payout_status === "paid"), "seller_earning"),
  }

  return res.json({ orders, count, offset, limit, summary })
}
