import webpush from "web-push"
import { MedusaContainer } from "@medusajs/framework/types"
import { PUSH_MODULE } from "../modules/push"
import type PushModuleService from "../modules/push/service"

/**
 * Web push gönderim yardımcısı.
 *
 * - VAPID anahtarları .env'den okunur (VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT).
 * - Gönderim sırasında push servisi 404/410 dönerse abonelik artık geçersizdir
 *   (kullanıcı izni geri aldı / tarayıcı sildi) → kayıt otomatik temizlenir.
 * - Anahtarlar tanımlı değilse gönderim sessizce atlanır (yerel/test ortamı
 *   web push olmadan da çalışsın).
 */

export type PushPayload = {
  title: string
  body: string
  /** Bildirime tıklanınca açılacak yol (örn. /tr/account/orders/...). */
  url?: string
  icon?: string
  badge?: string
  image?: string
  /** Aynı tag'li bildirimler üst üste binmek yerine birbirini günceller. */
  tag?: string
}

type StoredSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let vapidConfigured: boolean | null = null

/** VAPID'i bir kez kurar; anahtar yoksa false döner (gönderim atlanır). */
function ensureVapid(): boolean {
  if (vapidConfigured !== null) {
    return vapidConfigured
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || "mailto:info@example.com"
  if (!publicKey || !privateKey) {
    vapidConfigured = false
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

/**
 * Verilen aboneliklere bildirimi gönderir. Geçersiz (404/410) abonelikleri
 * siler. Başarılı gönderim sayısını döner.
 */
export async function sendToSubscriptions(
  container: MedusaContainer,
  subs: StoredSubscription[],
  payload: PushPayload
): Promise<number> {
  const logger = container.resolve("logger")
  if (!ensureVapid()) {
    logger.warn("[WebPush] VAPID anahtarları tanımlı değil — push atlandı.")
    return 0
  }
  if (!subs.length) {
    return 0
  }

  const pushService = container.resolve<PushModuleService>(PUSH_MODULE)
  const data = JSON.stringify(payload)
  const staleIds: string[] = []
  let sent = 0

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          data,
          { TTL: 60 * 60 * 24 } // 24 saat: cihaz çevrimdışıysa açılınca teslim et
        )
        sent++
      } catch (err: any) {
        const status = err?.statusCode
        if (status === 404 || status === 410) {
          staleIds.push(s.id)
        } else {
          logger.warn(
            `[WebPush] Gönderim hatası (${status ?? "?"}): ${err?.message}`
          )
        }
      }
    })
  )

  if (staleIds.length) {
    await pushService.deletePushSubscriptions(staleIds)
    logger.info(`[WebPush] ${staleIds.length} geçersiz abonelik temizlendi.`)
  }
  return sent
}

/** Bir müşterinin tüm cihazlarına gönderir. */
export async function sendToCustomer(
  container: MedusaContainer,
  customerId: string,
  payload: PushPayload
): Promise<number> {
  if (!customerId) {
    return 0
  }
  const pushService = container.resolve<PushModuleService>(PUSH_MODULE)
  const subs = await pushService.listPushSubscriptions({
    customer_id: customerId,
  })
  return sendToSubscriptions(container, subs as StoredSubscription[], payload)
}

/**
 * Tüm abonelere (veya verilen filtreye uyan abonelere) gönderir — pazarlama/
 * kampanya yayını için. Gönderilen abone sayısını döner.
 */
export async function broadcast(
  container: MedusaContainer,
  payload: PushPayload,
  filter: Record<string, unknown> = {}
): Promise<{ total: number; sent: number }> {
  const pushService = container.resolve<PushModuleService>(PUSH_MODULE)
  const subs = (await pushService.listPushSubscriptions(filter, {
    take: null,
  })) as StoredSubscription[]
  const sent = await sendToSubscriptions(container, subs, payload)
  return { total: subs.length, sent }
}
