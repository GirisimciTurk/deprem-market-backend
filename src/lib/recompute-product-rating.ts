import { Modules } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../modules/review"
import type ReviewModuleService from "../modules/review/service"

/**
 * Bir ürünün onaylı yorumlarından ortalama puan + sayı hesaplayıp ürün
 * metadata'sına (rating + review_count) yazar. Böylece ürün kartları/listeleri
 * (product-preview `metadata.rating`/`review_count` okur) gerçek yorum ortalamasını
 * gösterir. Yorum admin tarafından onaylanınca/durumu değişince/silinince çağrılır.
 * Onaylı yorum kalmazsa alanlar temizlenir (uydurma puan gösterilmez).
 */
export async function recomputeProductRating(scope: any, productId?: string | null) {
  if (!productId) return
  try {
    const reviewService: ReviewModuleService = scope.resolve(REVIEW_MODULE)
    const approved = await reviewService.listProductReviews({
      product_id: productId,
      status: "approved",
    })
    const count = approved.length
    const avg =
      count > 0
        ? Math.round((approved.reduce((s, r) => s + (r.rating || 0), 0) / count) * 10) / 10
        : 0

    const productModule = scope.resolve(Modules.PRODUCT)
    const product = await productModule.retrieveProduct(productId).catch(() => null)
    if (!product) return

    const metadata = { ...((product.metadata as Record<string, unknown>) || {}) }
    if (count > 0) {
      metadata.rating = avg
      metadata.review_count = count
    } else {
      delete metadata.rating
      delete metadata.review_count
    }
    await productModule.updateProducts(productId, { metadata })
  } catch (e) {
    scope.resolve("logger").error(`[rating] recompute başarısız: ${(e as Error)?.message}`)
  }
}
