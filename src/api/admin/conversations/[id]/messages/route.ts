import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"

/**
 * GET /admin/conversations/:id/messages — bir konuşmanın mesaj geçmişi (gözetim,
 * salt-okunur). Admin mesaj geçmişini görür ama mesaj YAZAMAZ (moderasyon için).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conv: any = await marketplace.retrieveConversation(req.params.id).catch(() => null)
  if (!conv) return res.status(404).json({ message: "Konuşma bulunamadı." })

  let sellerName = "Satıcı"
  try {
    const seller: any = await marketplace.retrieveSeller(conv.seller_id)
    sellerName = seller?.name || sellerName
  } catch {
    /* satıcı silinmiş olabilir */
  }

  const messages = await marketplace.listConversationMessages(
    { conversation_id: conv.id },
    { order: { created_at: "ASC" }, take: 500 }
  )

  return res.json({
    conversation: {
      id: conv.id,
      seller: { id: conv.seller_id, name: sellerName },
      customer_name: conv.customer_name,
      customer_email: conv.customer_email,
      subject: conv.subject,
      order_display_id: conv.order_display_id,
      status: conv.status,
    },
    messages: (messages as any[]).map((m) => ({
      id: m.id,
      sender_type: m.sender_type,
      body: m.body,
      created_at: m.created_at,
    })),
  })
}
