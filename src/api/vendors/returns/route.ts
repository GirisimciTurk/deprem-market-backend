import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"

/** GET /vendors/returns?status=&limit=&offset= — satıcının iadeleri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined

  const filters: Record<string, unknown> = { seller_id: resolved.seller.id }
  if (status && ["requested", "received", "rejected"].includes(status)) filters.status = status

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [returns, count] = await marketplace.listAndCountSellerReturns(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Özet: toplam iade edilen kazanç (received).
  const all = await marketplace.listSellerReturns(
    { seller_id: resolved.seller.id, status: "received" },
    { take: 1000 }
  )
  const total_returned_earning = all.reduce((s: number, r: any) => s + Number(r.returned_earning ?? 0), 0)

  return res.json({ returns, count, offset, limit, summary: { total_returned_earning } })
}
