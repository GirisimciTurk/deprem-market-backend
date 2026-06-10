import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../modules/review"
import ReviewModuleService from "../../../modules/review/service"

/**
 * GET /admin/reviews?status=pending&q=...&limit=&offset=
 * Lists reviews for the admin panel. Protected by the default /admin auth.
 * Status + serbest-metin arama DB seviyesinde (sayfa sınırının ötesini de bulur).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (status && ["pending", "approved", "spam"].includes(status)) {
    filters.status = status
  }
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { product_title: { $ilike: like } },
      { customer_name: { $ilike: like } },
      { comment: { $ilike: like } },
    ]
  }

  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

  const [reviews, count] = await reviewService.listAndCountProductReviews(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ reviews, count, offset, limit })
}
