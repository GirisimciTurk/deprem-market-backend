import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { isLlmEnabled, draftSellerReply } from "../../../../../lib/llm"

/**
 * POST /vendors/questions/:id/draft — ürün sorusuna AI yanıt TASLAĞI üretir.
 * Satıcı taslağı düzenleyip /answer ile gönderir. AI kapalı/hata → { draft: "" }.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (!isLlmEnabled()) return res.json({ draft: "", disabled: true })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const q: any = await marketplace.retrieveProductQuestion(req.params.id).catch(() => null)
  if (!q || q.seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Soru bulunamadı." })
  }

  const out = await draftSellerReply({
    kind: "question",
    productTitle: q.product_title,
    customerText: q.question,
  })
  if (!out.ok) return res.json({ draft: "", error: out.error })
  return res.json({ draft: out.draft })
}
