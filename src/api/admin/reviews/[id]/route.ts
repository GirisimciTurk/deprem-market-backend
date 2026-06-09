import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { REVIEW_MODULE } from "../../../../modules/review"
import ReviewModuleService from "../../../../modules/review/service"

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "spam"]),
})

/**
 * POST /admin/reviews/:id  { status }
 * Updates a review's moderation status — "approved" is the "Yayınla" action
 * that makes it visible on the storefront.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz durum." })
  }

  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

  const review = await reviewService.updateProductReviews({
    id: req.params.id,
    status: parsed.data.status,
  })

  return res.json({ review })
}

/**
 * DELETE /admin/reviews/:id
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  await reviewService.deleteProductReviews(req.params.id)
  return res.json({ id: req.params.id, object: "review", deleted: true })
}
