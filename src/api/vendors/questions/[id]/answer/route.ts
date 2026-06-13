import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { sendQuestionAnsweredEmail } from "../../../../../lib/qa-mail"

/**
 * POST /vendors/questions/:id/answer  { answer } — satıcı ürün sorusunu yanıtlar.
 * Soru "answered" olur (ürün sayfasında herkese görünür) ve müşteriye bildirim gider.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const id = req.params.id
  const answer = ((req.body as any)?.answer ?? "").toString().trim()
  if (answer.length < 1 || answer.length > 2000) {
    return res.status(400).json({ message: "Yanıt 1-2000 karakter olmalı." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const q: any = await marketplace.retrieveProductQuestion(id).catch(() => null)
  if (!q || q.seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Soru bulunamadı." })
  }
  if (q.status === "rejected") {
    return res.status(400).json({ message: "Bu soru reddedilmiş, yanıtlanamaz." })
  }

  await marketplace.updateProductQuestions({
    id,
    answer,
    status: "answered",
    answered_at: new Date(),
  } as any)

  try {
    await sendQuestionAnsweredEmail(req.scope, {
      customer_email: q.customer_email,
      product_title: q.product_title,
      question: q.question,
      answer,
    })
  } catch {
    /* best-effort */
  }

  return res.json({ answered: true })
}
