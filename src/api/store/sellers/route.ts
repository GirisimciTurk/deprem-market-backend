import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sellerRatingAvg } from "../../../lib/seller-rating"

/**
 * GET /store/sellers?featured=1 — herkese açık satıcı (bayi) listesi.
 * featured=1 ise yalnız "öne çıkan" aktif bayiler döner (mağazada öne çıkma —
 * PDF Slayt 4). is_house (birinci-parti) hariç tutulur; vitrin bayiler içindir.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const onlyFeatured = ["1", "true"].includes(String(req.query.featured ?? ""))
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const filters: Record<string, unknown> = { status: "active", is_house: false }
  if (onlyFeatured) filters.is_featured = true

  const { data } = await query.graph({
    entity: "seller",
    fields: [
      "id",
      "handle",
      "name",
      "logo",
      "description",
      "is_featured",
      "rating_sum",
      "rating_count",
    ],
    filters: filters as any,
  })

  const sellers = (data as any[])
    // Öne çıkanlar üstte, sonra puana göre.
    .sort((a, b) => {
      const f = (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0)
      if (f !== 0) return f
      return (
        sellerRatingAvg(b.rating_sum, b.rating_count) -
        sellerRatingAvg(a.rating_sum, a.rating_count)
      )
    })
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      handle: s.handle,
      name: s.name,
      logo: s.logo,
      description: s.description,
      is_featured: !!s.is_featured,
      rating_avg: sellerRatingAvg(s.rating_sum, s.rating_count),
      rating_count: s.rating_count ?? 0,
    }))

  return res.json({ sellers, count: sellers.length })
}
