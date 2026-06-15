import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveSeller } from "../_lib/resolve-seller"

/**
 * GET /vendors/categories — satıcı ürün eklerken seçebileceği aktif kategoriler.
 * Kategoriler platform genelidir (admin oluşturur); satıcı yalnız seçer.
 * parent_category_id ile ağaç kurulabilir; düz liste + parent bilgisi döner.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle", "parent_category_id", "rank", "is_active", "is_internal"],
    filters: { is_active: true, is_internal: false },
    pagination: { take: 500, order: { rank: "ASC", name: "ASC" } },
  })

  return res.json({ categories: categories ?? [] })
}
