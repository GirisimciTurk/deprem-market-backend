import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

/**
 * GET /admin/conversations?limit=&offset= — platform genelinde tüm müşteri↔satıcı
 * konuşmaları (gözetim/moderasyon, salt-okunur). Satıcı adıyla zenginleştirilir.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [conversations, count] = await marketplace.listAndCountConversations(
    {},
    { order: { last_message_at: "DESC" }, skip: offset, take: limit }
  )

  const sellerIds = [...new Set((conversations as any[]).map((c) => c.seller_id).filter(Boolean))]
  const sellers = sellerIds.length
    ? await marketplace.listSellers({ id: sellerIds }, { take: sellerIds.length })
    : []
  const byId = new Map(sellers.map((s: any) => [s.id, s]))

  const enriched = (conversations as any[]).map((c) => ({
    id: c.id,
    seller: byId.get(c.seller_id)
      ? { id: c.seller_id, name: byId.get(c.seller_id).name }
      : { id: c.seller_id, name: "Satıcı" },
    customer_name: c.customer_name,
    order_display_id: c.order_display_id,
    subject: c.subject,
    status: c.status,
    last_message_at: c.last_message_at,
    last_message_preview: c.last_message_preview,
    last_sender_type: c.last_sender_type,
  }))

  return res.json({ conversations: enriched, count, offset, limit })
}
