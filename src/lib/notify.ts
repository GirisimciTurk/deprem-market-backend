import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

/**
 * Uygulama-içi bildirim merkezi yardımcıları (panel zil ikonu için).
 *
 * - notifySeller: tek bir satıcıya bildirim (satıcı panelinde görünür).
 * - notifyAdmins: TÜM adminlere ortak bildirim (admin kontrol merkezinde görünür;
 *   recipient_type="admin", seller_id=null — okunmamış durumu admin başına DEĞİL,
 *   bildirim başınadır; ilk okuyan herkes için okundu sayılır — kontrol merkezi
 *   tek operatör varsayımıyla yeterli, basit tutuldu).
 *
 * Hepsi best-effort: bildirim yazımı başarısız olsa bile çağıran akışı (sipariş
 * bölme, soru oluşturma, iade vb.) BOZULMAMALI → çağıranlar try/catch ile sarmalı
 * ya da bu helper'lar kendi içinde yutmalı. Burada hata logger'a yazılır, fırlatılmaz.
 */

export type NotifyType =
  | "order" // yeni sipariş (satıcı)
  | "return" // yeni iade talebi (satıcı)
  | "question" // yeni ürün sorusu (satıcı)
  | "review" // yeni satıcı değerlendirmesi (satıcı)
  | "message" // yeni müşteri mesajı (satıcı)
  | "reseller_application" // yeni bayilik başvurusu (admin)
  | "havar_request" // yeni HAVAR ön alım/kiralama talebi (admin)
  | "product_approval" // yayın bekleyen ürün (admin)
  | "seller_signup" // yeni satıcı kaydı / onay bekliyor (admin)
  | "general"

type NotifyInput = {
  type: NotifyType
  title: string
  body?: string | null
  link?: string | null
}

function svc(container: any): MarketplaceModuleService {
  return container.resolve(MARKETPLACE_MODULE)
}

/** Tek bir satıcıya panel-içi bildirim. */
export async function notifySeller(
  container: any,
  sellerId: string,
  n: NotifyInput
): Promise<void> {
  try {
    await svc(container).createNotificationItems([
      {
        recipient_type: "seller",
        seller_id: sellerId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      },
    ] as any)
  } catch (e: any) {
    container.resolve("logger")?.error?.(`[notify] satıcı bildirimi başarısız: ${e?.message}`)
  }
}

/** Tüm adminlere (kontrol merkezi) panel-içi bildirim. */
export async function notifyAdmins(container: any, n: NotifyInput): Promise<void> {
  try {
    await svc(container).createNotificationItems([
      {
        recipient_type: "admin",
        seller_id: null,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        link: n.link ?? null,
      },
    ] as any)
  } catch (e: any) {
    container.resolve("logger")?.error?.(`[notify] admin bildirimi başarısız: ${e?.message}`)
  }
}

/**
 * Bir alıcının (satıcı veya admin) bildirimlerini ve okunmamış sayısını getirir.
 * recipient_type="seller" ise sellerId zorunlu; "admin" ise yok sayılır.
 */
export async function listNotifications(
  container: any,
  opts: {
    recipientType: "seller" | "admin"
    sellerId?: string | null
    limit?: number
    offset?: number
    onlyUnread?: boolean
  }
): Promise<{ items: any[]; count: number; unread: number; offset: number; limit: number }> {
  const marketplace = svc(container)
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)

  const base: Record<string, unknown> = { recipient_type: opts.recipientType }
  if (opts.recipientType === "seller") base.seller_id = opts.sellerId ?? "__none__"

  const listFilters = { ...base }
  if (opts.onlyUnread) (listFilters as any).read_at = null

  const [items, count] = await marketplace.listAndCountNotificationItems(listFilters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  const [, unread] = await marketplace.listAndCountNotificationItems(
    { ...base, read_at: null },
    { take: 1 }
  )

  return { items, count, unread, offset, limit }
}

/**
 * Bildirim(ler)i okundu işaretle. id verilirse o bildirimi (sahiplik doğrulanarak),
 * verilmezse alıcının TÜM okunmamışlarını işaretler. Okunmuş sayısını döndürür.
 */
export async function markNotificationsRead(
  container: any,
  opts: { recipientType: "seller" | "admin"; sellerId?: string | null; id?: string }
): Promise<number> {
  const marketplace = svc(container)
  const now = new Date()

  const base: Record<string, unknown> = { recipient_type: opts.recipientType, read_at: null }
  if (opts.recipientType === "seller") base.seller_id = opts.sellerId ?? "__none__"

  let targets: any[]
  if (opts.id) {
    const one: any = await marketplace.retrieveNotificationItem(opts.id).catch(() => null)
    // Sahiplik doğrulaması.
    if (
      !one ||
      one.recipient_type !== opts.recipientType ||
      (opts.recipientType === "seller" && one.seller_id !== opts.sellerId)
    ) {
      return 0
    }
    if (one.read_at) return 0
    targets = [one]
  } else {
    targets = await marketplace.listNotificationItems(base, { take: 1000 })
  }

  if (targets.length === 0) return 0
  await marketplace.updateNotificationItems(
    targets.map((t) => ({ id: t.id, read_at: now })) as any
  )
  return targets.length
}

/**
 * Bir satıcının e-postasından bağımsız olarak, ürün→satıcı çözümünde kullanmak
 * üzere ürünün satıcı id'sini döndürür (best-effort, yoksa null).
 */
export async function resolveProductSellerId(
  container: any,
  productId: string
): Promise<string | null> {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "seller.id"],
      filters: { id: productId },
    })
    return (data?.[0] as any)?.seller?.id ?? null
  } catch {
    return null
  }
}
