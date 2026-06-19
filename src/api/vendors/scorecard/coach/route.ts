import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../../_lib/resolve-seller"
import { isLlmEnabled, coachScorecard } from "../../../../lib/llm"
import { computeSellerScorecard } from "../../../../lib/seller-scorecard"

/**
 * GET /vendors/scorecard/coach — satıcının kendi karnesinden AI performans koçluğu
 * (öncelikli, somut öneriler). AI kapalı/veri yok/hata → { advice: "" } (fail-open).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (!isLlmEnabled()) return res.json({ advice: "", disabled: true })

  const sc = await computeSellerScorecard(req.scope, resolved.seller.id)
  if (!sc.has_data) return res.json({ advice: "", no_data: true })

  const out = await coachScorecard({ scorecard: sc })
  if (!out.ok) return res.json({ advice: "", error: out.error })
  return res.json({ advice: out.advice })
}
