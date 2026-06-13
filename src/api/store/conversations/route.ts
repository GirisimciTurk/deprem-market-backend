import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { reviewLimiter, enforceRateLimit } from "../../../lib/rate-limiter"
import { getOrCreateConversation, postMessage } from "../../../lib/conversations"

/**
 * GET /store/conversations — giriş yapmış müşterinin konuşma listesi (satıcı adıyla
 * zenginleştirilir, son mesaja göre sıralı, okunmamış sayaçlı). "Mesajlarım" sayfası.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const conversations = await marketplace.listConversations(
    { customer_id: customerId },
    { order: { last_message_at: "DESC" }, take: 100 }
  )

  const sellerIds = [...new Set((conversations as any[]).map((c) => c.seller_id).filter(Boolean))]
  const sellers = sellerIds.length
    ? await marketplace.listSellers({ id: sellerIds }, { take: sellerIds.length })
    : []
  const byId = new Map(sellers.map((s: any) => [s.id, s]))

  const enriched = (conversations as any[]).map((c) => ({
    id: c.id,
    seller: byId.get(c.seller_id)
      ? { id: c.seller_id, name: byId.get(c.seller_id).name, handle: byId.get(c.seller_id).handle }
      : { id: c.seller_id, name: "Satıcı", handle: null },
    order_display_id: c.order_display_id,
    subject: c.subject,
    status: c.status,
    last_message_at: c.last_message_at,
    last_message_preview: c.last_message_preview,
    last_sender_type: c.last_sender_type,
    unread: Number(c.customer_unread ?? 0),
  }))

  const unreadTotal = enriched.reduce((s, c) => s + c.unread, 0)
  return res.json({ conversations: enriched, unread_total: unreadTotal })
}

const startSchema = z.object({
  seller_id: z.string().min(1).optional(),
  seller_handle: z.string().min(1).optional(),
  order_id: z.string().min(1).optional(),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(1).max(2000),
})

/**
 * POST /store/conversations — müşteri bir satıcıyla konuşma başlatır (veya mevcut
 * açık konuşmaya yazar) ve ilk mesajı gönderir. seller_id veya seller_handle ile
 * satıcı belirtilir; opsiyonel order_id sipariş bağlamı ekler (sahiplik doğrulanır).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(reviewLimiter, req, res)) return

  const customerId = req.auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = startSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz mesaj.", issues: parsed.error.issues })
  }
  const { seller_id, seller_handle, order_id, subject, message } = parsed.data
  if (!seller_id && !seller_handle) {
    return res.status(400).json({ message: "seller_id veya seller_handle gereklidir." })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  // Satıcıyı çöz (aktif olmalı).
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "status"],
    filters: seller_id ? { id: seller_id } : { handle: seller_handle },
  })
  const seller = sellers?.[0] as any
  if (!seller || seller.status !== "active") {
    return res.status(404).json({ message: "Satıcı bulunamadı." })
  }

  // Müşteri kimlik bilgisi.
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["first_name", "last_name", "email"],
    filters: { id: customerId },
  })
  const customer = (customers?.[0] as any) || {}
  const customerName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.email ||
    "Müşteri"

  // Sipariş bağlamı verildiyse sahiplik doğrula.
  let orderDisplayId: string | null = null
  if (order_id) {
    const order = await req.scope.resolve(Modules.ORDER).retrieveOrder(order_id).catch(() => null)
    if (!order || (order as any).customer_id !== customerId) {
      return res.status(404).json({ message: "Sipariş bulunamadı." })
    }
    orderDisplayId = (order as any).display_id ? String((order as any).display_id) : null
  }

  const conversation = await getOrCreateConversation(req.scope, {
    sellerId: seller.id,
    customerId,
    customerName,
    customerEmail: customer.email ?? null,
    orderId: order_id ?? null,
    orderDisplayId,
    subject: subject ?? null,
  })

  await postMessage(req.scope, { conversation, senderType: "customer", body: message })

  // Konuşmayı (güncel sayaçlarla) tekrar oku.
  const fresh = await marketplace.retrieveConversation(conversation.id)
  return res.status(201).json({ conversation: { id: fresh.id, status: (fresh as any).status } })
}
