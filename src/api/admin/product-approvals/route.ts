import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/product-approvals?status=proposed&limit=&offset=
 * Satıcıların eklediği, onay bekleyen ürünleri (varsayılan: proposed) satıcı
 * bilgisiyle listeler. Çift onay modelinin admin tarafı.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = (req.query.status as string | undefined) || "proposed"

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  // status core filtre olarak çalışır; ama "yalnız satıcısı olan" filtresi linked
  // alan olduğu için query.graph'ta yapılamaz → seller.* seçilir, JS'te elenir ve
  // sayfalama JS'te uygulanır (onay bekleyen ürün hacmi düşük).
  const { data: all } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "thumbnail",
      "handle",
      "created_at",
      "seller.id",
      "seller.name",
      "seller.handle",
      "variants.sku",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    filters: { status } as any,
    pagination: { take: 1000, order: { created_at: "DESC" } } as any,
  })

  const sellerOwned = (all as any[]).filter((p) => p.seller?.id)
  const count = sellerOwned.length
  const products = sellerOwned.slice(offset, offset + limit)

  return res.json({ products, count, offset, limit })
}
