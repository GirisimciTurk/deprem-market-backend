import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../modules/review"
import ReviewModuleService from "../../../../modules/review/service"

/**
 * GET /store/reviews/me
 * Returns the authenticated customer's own reviews (any status), so the
 * account "Yorumlarım" page can show their approval state.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Giriş gerekli." })
  }

  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const reviews = await reviewService.listProductReviews(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )

  return res.json({ reviews })
}
