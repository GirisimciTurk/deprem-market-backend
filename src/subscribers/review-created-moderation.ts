import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { REVIEW_MODULE } from "../modules/review"
import ReviewModuleService from "../modules/review/service"
import { moderateReview, moderateImage, isLlmEnabled, type AiAction } from "../lib/llm"
import { fetchImageAsBase64 } from "../lib/llm/client"

/**
 * Yeni müşteri yorumunu Gemini ile moderasyondan geçirir (asenkron).
 * Eşik bazlı otonomi:
 *   - auto_approve → status "approved" (yayınlanır)
 *   - auto_reject  → status "spam" (gizlenir)
 *   - needs_review → "pending" (admin kuyruğunda kalır, AI önerisi kaydedilir)
 * AI başarısız olursa fail-open: yorum "pending" kalır, ai_action="error".
 *
 * Event: `product_review.created` (store/reviews POST'ta yayınlanır).
 */
export default async function reviewCreatedModerationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!isLlmEnabled()) return

  const reviewService: ReviewModuleService = container.resolve(REVIEW_MODULE)
  const logger = container.resolve("logger")

  let review: any
  try {
    review = await reviewService.retrieveProductReview(data.id)
  } catch {
    return // yorum silinmiş olabilir
  }
  // İdempotent: zaten bir AI kararı işlendiyse tekrar değerlendirme.
  if (!review || review.ai_action) return

  // 1) Metin moderasyonu
  const textOutcome = await moderateReview({
    comment: review.comment,
    rating: review.rating,
    productTitle: review.product_title,
  })

  if (!textOutcome.ok) {
    logger.warn(`[ai-moderation] yorum ${data.id} metin hatası: ${textOutcome.error}`)
    await reviewService.updateProductReviews({
      id: data.id,
      ai_action: "error",
      ai_reason: String(textOutcome.error).slice(0, 500),
    })
    return
  }

  // 2) Foto moderasyonu (varsa) — URL'ler lokal/R2 fark etmez, indirip değerlendirilir.
  const imageUrls: string[] = Array.isArray(review.images) ? review.images.slice(0, 3) : []
  let imgVerdict: { action: AiAction; verdict: string; confidence: number; reason: string } | null = null
  if (imageUrls.length > 0) {
    const images = (await Promise.all(imageUrls.map((u) => fetchImageAsBase64(u)))).filter(
      (x): x is NonNullable<typeof x> => !!x
    )
    if (images.length > 0) {
      const imgOutcome = await moderateImage({
        images,
        context: `Müşteri yorumuna eklenen görsel. Ürün: ${review.product_title}`,
      })
      if (imgOutcome.ok) imgVerdict = imgOutcome
    }
  }

  // 3) Birleşik karar: herhangi biri red derse red; ikisi de onay ise onay; aksi halde insana.
  let action: AiAction = textOutcome.action
  let reason = textOutcome.reason
  if (imgVerdict) {
    if (imgVerdict.action === "auto_reject") {
      action = "auto_reject"
      reason = `Görsel: ${imgVerdict.reason}`
    } else if (action === "auto_approve" && imgVerdict.action !== "auto_approve") {
      action = "needs_review"
      reason = `Metin uygun ama görsel belirsiz: ${imgVerdict.reason}`
    }
  }

  const status =
    action === "auto_approve" ? "approved" : action === "auto_reject" ? "spam" : review.status

  await reviewService.updateProductReviews({
    id: data.id,
    status,
    ai_action: action,
    ai_verdict: textOutcome.verdict,
    ai_confidence: Math.round(textOutcome.confidence * 100), // 0-100 yüzde
    ai_reason: reason.slice(0, 1000),
  })

  logger.info(
    `[ai-moderation] yorum ${data.id}: ${action} (metin:${textOutcome.verdict}${
      imgVerdict ? ` görsel:${imgVerdict.verdict}` : ""
    } %${Math.round(textOutcome.confidence * 100)})`
  )
}

export const config: SubscriberConfig = {
  event: "product_review.created",
}
