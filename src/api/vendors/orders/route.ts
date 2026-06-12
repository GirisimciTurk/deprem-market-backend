import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"

/** GET /vendors/orders?status=&payout=&limit=&offset= — satıcının alt-siparişleri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined
  const payout = req.query.payout as string | undefined

  const filters: Record<string, unknown> = { seller_id: resolved.seller.id }
  if (status && ["pending", "fulfilled", "canceled"].includes(status)) filters.fulfillment_status = status
  if (payout && ["pending", "paid"].includes(payout)) filters.payout_status = payout

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [orders, count] = await marketplace.listAndCountSellerOrders(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ orders, count, offset, limit })
}
