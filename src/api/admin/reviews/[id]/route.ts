import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { REVIEW_MODULE } from "../../../../modules/review"
import ReviewModuleService from "../../../../modules/review/service"
import { sendReviewPublishedEmail } from "../../../../lib/review-mail"

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "spam"]),
})

/**
 * POST /admin/reviews/:id  { status }
 * Updates a review's moderation status — "approved" is the "Yayınla" action
 * that makes it visible on the storefront. İlk kez "approved" yapıldığında yorum
 * sahibine (e-postası varsa) "değerlendirmeniz yayınlandı" maili gönderilir.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz durum." })
  }

  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

  // Önceki durum — yalnız (pending/spam → approved) geçişinde mail at, tekrar onayda değil.
  const before = await reviewService.retrieveProductReview(req.params.id).catch(() => null)

  const review = await reviewService.updateProductReviews({
    id: req.params.id,
    status: parsed.data.status,
  })

  if (parsed.data.status === "approved" && (before as any)?.status !== "approved") {
    try {
      await sendReviewPublishedEmail(req.scope, review as any)
    } catch (e: any) {
      req.scope.resolve("logger").error(`[reviews] Yayın maili gönderilemedi: ${e?.message}`)
    }
  }

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
