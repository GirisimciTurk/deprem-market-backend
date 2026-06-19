import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { isLlmEnabled, draftSellerReply } from "../../../../../lib/llm"

/**
 * POST /vendors/conversations/:id/draft — müşteri mesajlaşmasına AI yanıt TASLAĞI.
 * Son müşteri mesajı + konuşma geçmişinden üretir; satıcı düzenleyip gönderir.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (!isLlmEnabled()) return res.json({ draft: "", disabled: true })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conv: any = await marketplace.retrieveConversation(req.params.id).catch(() => null)
  if (!conv || conv.seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Konuşma bulunamadı." })
  }

  const messages = (await marketplace.listConversationMessages(
    { conversation_id: conv.id },
    { order: { created_at: "ASC" }, take: 50 }
  )) as any[]

  const history = messages.map((m) => ({
    role: m.sender_type === "seller" ? ("seller" as const) : ("customer" as const),
    text: String(m.body ?? ""),
  }))
  const lastCustomer = [...messages].reverse().find((m) => m.sender_type !== "seller")
  const customerText = String(lastCustomer?.body ?? messages[messages.length - 1]?.body ?? "").trim()
  if (!customerText) return res.json({ draft: "", error: "Yanıtlanacak müşteri mesajı yok." })

  const out = await draftSellerReply({
    kind: "message",
    productTitle: conv.subject,
    customerText,
    history,
  })
  if (!out.ok) return res.json({ draft: "", error: out.error })
  return res.json({ draft: out.draft })
}
