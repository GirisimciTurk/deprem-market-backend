import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SHOWCASE_CATEGORIES } from "../../../lib/showcase-categories"

/**
 * GET /vendors/showcase-categories — sabit vitrin kategorileri (form referans verisi).
 * Ürün oluşturma/düzenleme sihirbazı bu listeyi çoklu-seçim için kullanır.
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  return res.json({ showcase_categories: SHOWCASE_CATEGORIES })
}
