import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { notifySeller } from "./notify"
import { sendMessageToSellerEmail, sendMessageToCustomerEmail } from "./message-mail"

type SenderType = "customer" | "seller"

function svc(container: any): MarketplaceModuleService {
  return container.resolve(MARKETPLACE_MODULE)
}

/**
 * Bir müşteri ile bir satıcı arasında AÇIK konuşmayı bulur; yoksa oluşturur
 * (get-or-create). Aynı çift + (varsa) aynı order_id için tek açık konuşma tutulur.
 * Konuşmaya ait müşteri kimlik bilgileri ilk oluşturmada denormalize edilir.
 */
export async function getOrCreateConversation(
  container: any,
  args: {
    sellerId: string
    customerId: string
    customerName: string
    customerEmail?: string | null
    orderId?: string | null
    orderDisplayId?: string | null
    subject?: string | null
  }
): Promise<any> {
  const marketplace = svc(container)

  const filters: Record<string, unknown> = {
    seller_id: args.sellerId,
    customer_id: args.customerId,
    status: "open",
  }
  if (args.orderId) filters.order_id = args.orderId

  const existing = await marketplace.listConversations(filters, { take: 1 })
  if (existing.length > 0) return existing[0]

  const createdRes = (await marketplace.createConversations([
    {
      seller_id: args.sellerId,
      customer_id: args.customerId,
      customer_name: args.customerName,
      customer_email: args.customerEmail ?? null,
      order_id: args.orderId ?? null,
      order_display_id: args.orderDisplayId ?? null,
      subject: args.subject ?? null,
      status: "open",
      seller_unread: 0,
      customer_unread: 0,
    },
  ] as any)) as unknown
  return Array.isArray(createdRes) ? createdRes[0] : createdRes
}

/**
 * Konuşmaya mesaj ekler: mesaj kaydı oluşturur, konuşmanın son-mesaj alanlarını ve
 * KARŞI tarafın okunmamış sayacını günceller, alıcıya bildirim/e-posta gönderir.
 * sender_type="customer" → satıcıya panel bildirimi + e-posta; "seller" → müşteriye e-posta.
 * Best-effort bildirim (mesaj kaydı her hâlükârda yazılır).
 */
export async function postMessage(
  container: any,
  args: { conversation: any; senderType: SenderType; body: string }
): Promise<any> {
  const marketplace = svc(container)
  const conv = args.conversation
  const now = new Date()
  const preview = args.body.slice(0, 140)

  const msgRes = (await marketplace.createConversationMessages([
    { conversation_id: conv.id, sender_type: args.senderType, body: args.body },
  ] as any)) as unknown
  const message = (Array.isArray(msgRes) ? msgRes[0] : msgRes) as any

  // Son-mesaj alanları + karşı tarafın okunmamış sayacı artar.
  const update: Record<string, unknown> = {
    id: conv.id,
    last_message_at: now,
    last_message_preview: preview,
    last_sender_type: args.senderType,
    status: "open",
  }
  if (args.senderType === "customer") {
    update.seller_unread = Number(conv.seller_unread ?? 0) + 1
  } else {
    update.customer_unread = Number(conv.customer_unread ?? 0) + 1
  }
  await marketplace.updateConversations(update as any)

  // Bildirim/e-posta (best-effort).
  try {
    if (args.senderType === "customer") {
      const seller: any = await marketplace.retrieveSeller(conv.seller_id).catch(() => null)
      await notifySeller(container, conv.seller_id, {
        type: "message",
        title: `${conv.customer_name || "Müşteri"} size mesaj gönderdi`,
        body: preview,
        link: "/mesajlar",
      })
      await sendMessageToSellerEmail(container, {
        seller_email: seller?.email,
        seller_name: seller?.name,
        customer_name: conv.customer_name || "Müşteri",
        body: args.body,
      })
    } else {
      const seller: any = await marketplace.retrieveSeller(conv.seller_id).catch(() => null)
      await sendMessageToCustomerEmail(container, {
        customer_email: conv.customer_email,
        seller_name: seller?.name,
        body: args.body,
      })
    }
  } catch (e: any) {
    container.resolve("logger")?.error?.(`[conversations] bildirim başarısız: ${e?.message}`)
  }

  return message
}

/** Bir tarafın okunmamış sayacını sıfırlar (thread açıldığında). */
export async function markConversationRead(
  container: any,
  conversationId: string,
  reader: SenderType
): Promise<void> {
  const field = reader === "seller" ? "seller_unread" : "customer_unread"
  await svc(container).updateConversations({ id: conversationId, [field]: 0 } as any)
}

/** Bir tarafın TÜM açık konuşmalarındaki toplam okunmamış mesaj sayısı (rozet için). */
export async function unreadTotal(
  container: any,
  reader: SenderType,
  filter: { sellerId?: string; customerId?: string }
): Promise<number> {
  const marketplace = svc(container)
  const where: Record<string, unknown> = {}
  if (reader === "seller" && filter.sellerId) where.seller_id = filter.sellerId
  if (reader === "customer" && filter.customerId) where.customer_id = filter.customerId
  const convs = await marketplace.listConversations(where, { take: 1000 })
  const field = reader === "seller" ? "seller_unread" : "customer_unread"
  return (convs as any[]).reduce((s, c) => s + Number(c[field] ?? 0), 0)
}
