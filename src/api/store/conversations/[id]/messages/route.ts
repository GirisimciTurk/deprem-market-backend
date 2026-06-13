import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { reviewLimiter, enforceRateLimit } from "../../../../../lib/rate-limiter"
import { postMessage, markConversationRead } from "../../../../../lib/conversations"

/** Konuşmanın müşteriye ait olduğunu doğrular; değilse null döner. */
async function ownedByCustomer(
  marketplace: MarketplaceModuleService,
  conversationId: string,
  customerId: string
): Promise<any | null> {
  const conv: any = await marketplace.retrieveConversation(conversationId).catch(() => null)
  if (!conv || conv.customer_id !== customerId) return null
  return conv
}

/**
 * GET /store/conversations/:id/messages — konuşmanın mesaj geçmişi (müşteri tarafı).
 * Sahiplik doğrulanır; açıldığında müşterinin okunmamış sayacı sıfırlanır.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conv = await ownedByCustomer(marketplace, req.params.id, customerId)
  if (!conv) return res.status(404).json({ message: "Konuşma bulunamadı." })

  const messages = await marketplace.listConversationMessages(
    { conversation_id: conv.id },
    { order: { created_at: "ASC" }, take: 500 }
  )

  // Müşteri thread'i açtı → okunmamış sıfırlanır.
  if (Number(conv.customer_unread ?? 0) > 0) {
    await markConversationRead(req.scope, conv.id, "customer")
  }

  return res.json({
    conversation: {
      id: conv.id,
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

const sendSchema = z.object({ body: z.string().trim().min(1).max(2000) })

/** POST /store/conversations/:id/messages — müşteri mevcut konuşmaya yanıt yazar. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(reviewLimiter, req, res)) return

  const customerId = req.auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = sendSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Mesaj 1-2000 karakter olmalı." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conv = await ownedByCustomer(marketplace, req.params.id, customerId)
  if (!conv) return res.status(404).json({ message: "Konuşma bulunamadı." })

  const message = await postMessage(req.scope, {
    conversation: conv,
    senderType: "customer",
    body: parsed.data.body,
  })

  return res.status(201).json({
    message: { id: message.id, sender_type: "customer", body: parsed.data.body, created_at: message.created_at },
  })
}
