import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../_lib/resolve-seller"
import { computeSellerAnalytics } from "../../../lib/seller-scorecard"

/** GET /vendors/analytics?days=30 — satıcının satış analitiği (seri + en çok satanlar). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const days = Number(req.query.days) || 30
  const analytics = await computeSellerAnalytics(req.scope, resolved.seller.id, days)
  return res.json({ analytics })
}
