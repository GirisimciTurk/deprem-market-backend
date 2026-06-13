import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "spam"]),
})

/**
 * POST /admin/seller-reviews/:id  { status }
 * Değerlendirmenin moderasyon durumunu günceller — "approved" = "Yayınla"
 * (mağaza vitrininde görünür) + satıcı ortalama puanını yeniden hesaplar.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz durum." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const existing = await marketplace.retrieveSellerReview(req.params.id).catch(() => null)
  if (!existing) {
    return res.status(404).json({ message: "Değerlendirme bulunamadı." })
  }

  const review = await marketplace.updateSellerReviews({
    id: req.params.id,
    status: parsed.data.status,
  })

  // Onay/spam değişimi ortalama puanı etkiler → yeniden hesapla.
  await marketplace.recomputeSellerRating((existing as any).seller_id)

  return res.json({ review })
}

/**
 * DELETE /admin/seller-reviews/:id
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const existing = await marketplace.retrieveSellerReview(req.params.id).catch(() => null)
  if (!existing) {
    return res.status(404).json({ message: "Değerlendirme bulunamadı." })
  }
  await marketplace.deleteSellerReviews(req.params.id)
  await marketplace.recomputeSellerRating((existing as any).seller_id)
  return res.json({ id: req.params.id, object: "seller_review", deleted: true })
}
