import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/seller-reviews?status=&seller_id=&q=&limit=&offset=
 * Satıcı değerlendirmelerini moderasyon paneli için listeler. Satıcı adı/handle'ı
 * da gelir (query.graph linki). Admin-only (middlewares ADMIN_ONLY_MATCHERS).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const sellerId = req.query.seller_id as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (status && ["pending", "approved", "spam"].includes(status)) {
    filters.status = status
  }
  if (sellerId) filters.seller_id = sellerId
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { customer_name: { $ilike: like } },
      { comment: { $ilike: like } },
    ]
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: reviews, metadata } = await query.graph({
    entity: "seller_review",
    fields: [
      "id",
      "rating",
      "comment",
      "status",
      "customer_name",
      "customer_id",
      "order_id",
      "created_at",
      "seller.id",
      "seller.name",
      "seller.handle",
    ],
    filters,
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })

  return res.json({ reviews, count: metadata?.count ?? reviews.length, offset, limit })
}
