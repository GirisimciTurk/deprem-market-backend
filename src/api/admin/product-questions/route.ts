import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

/**
 * GET /admin/product-questions?status=&limit=&offset= — platform genelinde tüm
 * ürün soruları (moderasyon). Satıcı adıyla zenginleştirilir.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const filters: Record<string, unknown> = {}
  if (status && ["pending", "answered", "rejected"].includes(status)) filters.status = status

  const [questions, count] = await marketplace.listAndCountProductQuestions(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  const sellerIds = [...new Set((questions as any[]).map((q) => q.seller_id).filter(Boolean))]
  const sellers = sellerIds.length
    ? await marketplace.listSellers({ id: sellerIds }, { take: sellerIds.length })
    : []
  const byId = new Map(sellers.map((s: any) => [s.id, s]))

  const enriched = (questions as any[]).map((q) => ({
    ...q,
    seller: byId.get(q.seller_id)
      ? { id: q.seller_id, name: byId.get(q.seller_id).name }
      : null,
  }))

  return res.json({ questions: enriched, count, offset, limit })
}
