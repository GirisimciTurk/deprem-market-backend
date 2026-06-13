import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"
import { sellerRatingAvg } from "../../../lib/seller-rating"

/**
 * GET /vendors/reviews?limit=&offset= — satıcının kendi değerlendirmeleri
 * (yalnız onaylı/yayındakiler) + özet (ortalama puan, sayı). Salt-okunur.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [reviews, count] = await marketplace.listAndCountSellerReviews(
    { seller_id: resolved.seller.id, status: "approved" },
    { order: { created_at: "DESC" }, skip: offset, take: limit }
  )

  return res.json({
    reviews,
    count,
    offset,
    limit,
    rating_avg: sellerRatingAvg(
      (resolved.seller as any).rating_sum,
      (resolved.seller as any).rating_count
    ),
    rating_count: (resolved.seller as any).rating_count ?? 0,
  })
}
