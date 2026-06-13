import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../_lib/resolve-seller"
import { computeSellerScorecard } from "../../../lib/seller-scorecard"

/** GET /vendors/scorecard — satıcının kendi performans karnesi. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const scorecard = await computeSellerScorecard(req.scope, resolved.seller.id)
  return res.json({ scorecard })
}
