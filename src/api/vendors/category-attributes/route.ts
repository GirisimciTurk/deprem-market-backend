import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../_lib/resolve-seller"
import { resolveCategoryAttributes } from "../../../lib/category-attributes"

/**
 * GET /vendors/category-attributes?category_id= — satıcı ürün eklerken seçtiği
 * kategori için doldurması gereken dinamik özellikler (kategori + üst kategorilerden
 * MİRAS dahil). Form bu tanımlara göre dinamik alanlar render eder.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const categoryId = req.query.category_id as string | undefined
  if (!categoryId) return res.json({ attributes: [] })

  const attributes = await resolveCategoryAttributes(req.scope, categoryId)
  return res.json({ attributes })
}
