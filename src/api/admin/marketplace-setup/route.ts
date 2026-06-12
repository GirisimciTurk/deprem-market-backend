import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runMarketplaceSetup } from "../../../lib/marketplace-setup"

/**
 * POST /admin/marketplace-setup — pazar yeri başlangıç kurulumunu çalıştırır
 * (house satıcı + ürün bağlama + geçmiş sipariş bölme). İdempotent; prod'da
 * imajda script kaynağı bulunmadığı için kurulum bu uçtan tetiklenir. Admin-only.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const result = await runMarketplaceSetup(req.scope)
  return res.json({ ok: true, ...result })
}
