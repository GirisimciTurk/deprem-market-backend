import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sellerRatingAvg } from "../../../../lib/seller-rating"

/**
 * GET /store/sellers/:handle — satıcı mağaza vitrini için herkese açık satıcı
 * bilgisi + yayındaki ürün id'leri. (Ürünü seller ile doğrudan filtreleyemediğimiz
 * için satıcı→ürün yönünden id'ler döner; storefront bu id'lerle /store/products sorgular.)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const handle = req.params.handle
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "seller",
    fields: [
      "id",
      "handle",
      "name",
      "logo",
      "description",
      "is_house",
      "status",
      "rating_sum",
      "rating_count",
      "products.id",
      "products.status",
    ],
    filters: { handle } as any,
  })

  const seller = data?.[0] as any
  if (!seller || seller.status !== "active") {
    return res.status(404).json({ message: "Satıcı bulunamadı." })
  }

  const product_ids = (seller.products || [])
    .filter((p: any) => p.status === "published")
    .map((p: any) => p.id)

  return res.json({
    seller: {
      id: seller.id,
      handle: seller.handle,
      name: seller.name,
      logo: seller.logo,
      description: seller.description,
      is_house: seller.is_house,
      rating_avg: sellerRatingAvg(seller.rating_sum, seller.rating_count),
      rating_count: seller.rating_count ?? 0,
    },
    product_ids,
    count: product_ids.length,
  })
}
