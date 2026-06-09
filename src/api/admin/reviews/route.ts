import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../modules/review"
import ReviewModuleService from "../../../modules/review/service"

/**
 * GET /admin/reviews?status=pending&q=...
 * Lists reviews for the admin panel. Protected by the default /admin auth.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const q = req.query.q as string | undefined

  const filters: Record<string, unknown> = {}
  if (status && ["pending", "approved", "spam"].includes(status)) {
    filters.status = status
  }

  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

  const [reviews, count] = await reviewService.listAndCountProductReviews(
    filters,
    { order: { created_at: "DESC" }, take: 200 }
  )

  // Optional free-text search across product/customer/comment (in-memory; the
  // review volume here is small).
  const needle = q?.trim().toLowerCase()
  const filtered = needle
    ? reviews.filter(
        (r) =>
          r.product_title?.toLowerCase().includes(needle) ||
          r.customer_name?.toLowerCase().includes(needle) ||
          r.comment?.toLowerCase().includes(needle)
      )
    : reviews

  return res.json({ reviews: filtered, count })
}
