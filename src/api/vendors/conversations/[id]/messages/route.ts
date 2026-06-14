import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { postMessage, markConversationRead } from "../../../../../lib/conversations"
import { vendorMessageLimiter, enforceRateLimit } from "../../../../../lib/rate-limiter"

/** Konuşmanın bu satıcıya ait olduğunu doğrular; değilse null. */
async function ownedBySeller(
  marketplace: MarketplaceModuleService,
  conversationId: string,
  sellerId: string
): Promise<any | null> {
  const conv: any = await marketplace.retrieveConversation(conversationId).catch(() => null)
  if (!conv || conv.seller_id !== sellerId) return null
  return conv
}

/**
 * GET /vendors/conversations/:id/messages — konuşma geçmişi (satıcı tarafı).
 * Sahiplik doğrulanır; açıldığında satıcının okunmamış sayacı sıfırlanır.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conv = await ownedBySeller(marketplace, req.params.id, resolved.seller.id)
  if (!conv) return res.status(404).json({ message: "Konuşma bulunamadı." })

  const messages = await marketplace.listConversationMessages(
    { conversation_id: conv.id },
    { order: { created_at: "ASC" }, take: 500 }
  )

  if (Number(conv.seller_unread ?? 0) > 0) {
    await markConversationRead(req.scope, conv.id, "seller")
  }

  return res.json({
    conversation: {
      id: conv.id,
      customer_name: conv.customer_name,
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

/** POST /vendors/conversations/:id/messages — satıcı müşteriye yanıt yazar. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(vendorMessageLimiter, req, res)) return
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = sendSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Mesaj 1-2000 karakter olmalı." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conv = await ownedBySeller(marketplace, req.params.id, resolved.seller.id)
  if (!conv) return res.status(404).json({ message: "Konuşma bulunamadı." })

  const message = await postMessage(req.scope, {
    conversation: conv,
    senderType: "seller",
    body: parsed.data.body,
  })

  return res.status(201).json({
    message: { id: message.id, sender_type: "seller", body: parsed.data.body, created_at: message.created_at },
  })
}
