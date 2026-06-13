import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"

/**
 * GET /vendors/conversations — satıcının müşteri mesajlaşma konuşmaları
 * (son mesaja göre sıralı, okunmamış sayaçlı). Toplam okunmamış rozet için döner.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conversations = await marketplace.listConversations(
    { seller_id: resolved.seller.id },
    { order: { last_message_at: "DESC" }, take: 200 }
  )

  const enriched = (conversations as any[]).map((c) => ({
    id: c.id,
    customer_name: c.customer_name,
    order_display_id: c.order_display_id,
    subject: c.subject,
    status: c.status,
    last_message_at: c.last_message_at,
    last_message_preview: c.last_message_preview,
    last_sender_type: c.last_sender_type,
    unread: Number(c.seller_unread ?? 0),
  }))

  const unreadTotal = enriched.reduce((s, c) => s + c.unread, 0)
  return res.json({ conversations: enriched, unread_total: unreadTotal })
}
