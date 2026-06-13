import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"

/**
 * GET /vendors/questions?status=&limit=&offset= — satıcının ürün soruları.
 * status: pending (yanıt bekleyen) | answered | rejected.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined

  const filters: Record<string, unknown> = { seller_id: resolved.seller.id }
  if (status && ["pending", "answered", "rejected"].includes(status)) filters.status = status

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [questions, count] = await marketplace.listAndCountProductQuestions(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Yanıt bekleyen toplam (panel rozeti için).
  const [, pendingCount] = await marketplace.listAndCountProductQuestions(
    { seller_id: resolved.seller.id, status: "pending" },
    { take: 1 }
  )

  return res.json({ questions, count, offset, limit, pending_count: pendingCount })
}
