import webpush from "web-push"
import { MedusaContainer } from "@medusajs/framework/types"
import { PUSH_MODULE } from "../modules/push"
import type PushModuleService from "../modules/push/service"
import { errorMessage } from "./errors"
import { groupByLocale, type PushLocale } from "./push-i18n"

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
  /**
   * Bildirim altındaki aksiyon butonları (örn. "Siparişi gör"). Storefront SW'si
   * `action`'a göre `url`'e gider; `url` yoksa bildirimin ana `url`'i kullanılır.
   * Tarayıcılar genelde en fazla 2 buton gösterir.
   */
  actions?: { action: string; title: string; icon?: string; url?: string }[]
}

type StoredSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let vapidConfigured: boolean | null = null

/** VAPID'i bir kez kurar; anahtar yoksa false döner (gönderim atlanır). */
/**
 * Push gönderimi yapılandırılmış mı (VAPID anahtarları var mı)?
 *
 * Çağıranların "gönderilemedi" ile "hiç denenmedi"yi ayırt edebilmesi için dışa
 * açık: ör. stok uyarıları, VAPID yokken kayıtları SİLMEMELİ — yoksa anahtarlar
 * kurulana kadar biriken tüm "haber ver" talepleri sessizce kaybolur.
 */
export function isPushConfigured(): boolean {
  return ensureVapid()
}

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
 * Gönderim sonucu. Yalnız toplam sayı yetmiyordu: çağıran (ör. stok uyarısı)
 * HANGİ kaydın gerçekten teslim edildiğini bilmeden kayıt silerse, ulaşılamayan
 * kullanıcıların talepleri de "gönderildi" sayılıp kaybolur.
 */
export type SendResult = {
  sent: number
  /** Bildirimin BAŞARIYLA ulaştığı endpoint'ler. */
  okEndpoints: Set<string>
}

/**
 * Verilen aboneliklere bildirimi gönderir. Geçersiz (404/410) abonelikleri
 * siler. Başarılı gönderim sayısını döner.
 */
export async function sendToSubscriptions(
  container: MedusaContainer,
  subs: StoredSubscription[],
  payload: PushPayload
): Promise<SendResult> {
  const logger = container.resolve("logger")
  if (!ensureVapid()) {
    logger.warn("[WebPush] VAPID anahtarları tanımlı değil — push atlandı.")
    return { sent: 0, okEndpoints: new Set() }
  }
  if (!subs.length) {
    return { sent: 0, okEndpoints: new Set() }
  }

  const pushService = container.resolve<PushModuleService>(PUSH_MODULE)
  const data = JSON.stringify(payload)
  const staleIds: string[] = []
  const okEndpoints = new Set<string>()
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
        okEndpoints.add(s.endpoint)
      } catch (err) {
        const status = err?.statusCode
        if (status === 404 || status === 410) {
          staleIds.push(s.id)
        } else {
          logger.warn(
            `[WebPush] Gönderim hatası (${status ?? "?"}): ${errorMessage(err)}`
          )
        }
      }
    })
  )

  if (staleIds.length) {
    // Temizlik gönderimi bozmamalı: burada fırlayan hata, BAŞARIYLA gönderilmiş
    // bildirimlerin sonucunu da (okEndpoints) çağırana ulaşmadan çöpe atardı.
    try {
      await pushService.deletePushSubscriptions(staleIds)
      logger.info(`[WebPush] ${staleIds.length} geçersiz abonelik temizlendi.`)
    } catch (err) {
      logger.warn(
        `[WebPush] Geçersiz abonelikler silinemedi: ${errorMessage(err)}`
      )
    }
  }
  return { sent, okEndpoints }
}

/**
 * Bir müşterinin tüm cihazlarına, HER CİHAZIN KENDİ DİLİNDE gönderir.
 *
 * Metin `build(locale)` ile kurulur ve abonelikler `locale` alanına göre
 * gruplanır. Sabit metinli `sendToCustomer` bunun üzerine kuruludur; tek bir
 * müşterinin cihazları farklı dillerde olabilir (telefon TR, iş bilgisayarı EN).
 */
export async function sendToCustomerLocalized(
  container: MedusaContainer,
  customerId: string,
  build: (locale: PushLocale) => PushPayload
): Promise<number> {
  if (!customerId) {
    return 0
  }
  // VAPID kontrolü grup döngüsünün İÇİNDE kalırsa aynı uyarı her dil grubu için
  // tekrar loglanır ve abonelikler boşuna sorgulanır.
  if (!isPushConfigured()) {
    container
      .resolve<{ warn: (m: string) => void }>("logger")
      .warn("[WebPush] VAPID anahtarları tanımlı değil — push atlandı.")
    return 0
  }

  const pushService = container.resolve<PushModuleService>(PUSH_MODULE)
  const subs = (await pushService.listPushSubscriptions({
    customer_id: customerId,
  })) as StoredSubscription[]
  if (!subs.length) {
    return 0
  }

  // Gruplar birbirini beklemesin: dil ayrımından önce tüm cihazlar tek
  // Promise.all ile paralel gidiyordu, o davranış korunuyor.
  const results = await Promise.all(
    [...groupByLocale(subs as (StoredSubscription & { locale?: string | null })[])].map(
      ([loc, group]) => sendToSubscriptions(container, group, build(loc))
    )
  )
  return results.reduce((n, r) => n + r.sent, 0)
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
  const { sent } = await sendToSubscriptions(container, subs, payload)
  return { total: subs.length, sent }
}
