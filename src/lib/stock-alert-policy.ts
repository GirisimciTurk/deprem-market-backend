/**
 * "Stoğa gelince haber ver" kayıtlarının HEDEFLEME ve YAŞAM SÜRESİ kuralları.
 *
 * Bu iki karar da sessizce yanlış davranabilir (yanlış kişiye bildirim, sessiz
 * veri kaybı) ve gerçek gönderim olmadan denenmesi zor. Bu yüzden saf
 * fonksiyonlara ayrıldı; notifyBackInStock yalnız veriyi toplayıp bunları çağırır.
 */

export type AlertLike = {
  endpoint: string
  customer_id?: string | null
  created_at?: string | Date | null
}

export type SubscriptionLike = {
  endpoint: string
  customer_id?: string | null
}

/**
 * Bir uyarının gönderileceği abonelikler.
 *
 * KURAL:
 *  1. Uyarı bir hesaba bağlıysa müşterinin O ANKİ TÜM cihazlarına gider —
 *     kullanıcı uyarıyı telefonda kurup masaüstünde kaçırmasın.
 *  2. Hesabın kayıtlı cihazı kalmadıysa uyarının kendi endpoint'ine düşülür,
 *     ancak yalnız o abonelik AYNI hesaba aitse. `customer_id === null` bağın
 *     ÇÖZÜLDÜĞÜ anlamına gelir (çıkışta bilerek yapılır) → ortak cihazda eski
 *     sahibin bildirimi yeni kullanıcıya düşmemeli.
 *  3. Hesaba bağlı olmayan (misafir dönemi) kayıtlar yalnız kendi endpoint'ine.
 */
export function resolveAlertTargets(
  alert: AlertLike,
  index: {
    subsByCustomer: Map<string, SubscriptionLike[]>
    subByEndpoint: Map<string, SubscriptionLike>
  }
): SubscriptionLike[] {
  const fromCustomer = alert.customer_id
    ? (index.subsByCustomer.get(alert.customer_id) ?? [])
    : []
  if (fromCustomer.length) return fromCustomer

  const own = index.subByEndpoint.get(alert.endpoint)
  if (!own) return []
  if (alert.customer_id && own.customer_id !== alert.customer_id) return []
  return [own]
}

/** Ortam değişkeniyle geçersiz kılınabilir TTL (gün); geçersiz değerde 90. */
export function getStockAlertTtlDays(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = Number(env.STOCK_ALERT_TTL_DAYS)
  return Number.isFinite(raw) && raw > 0 ? raw : 90
}

/**
 * Teslim edilemeyen kayıt artık düşürülmeli mi?
 *
 * Tarih okunamıyorsa (alan gelmemiş, bozuk değer) DAİMA false döner: şüphede
 * kalan kayıt silinmez — sessiz veri kaybı, gereksiz saklamadan kötüdür.
 */
export function isStockAlertExpired(
  createdAt: string | Date | null | undefined,
  nowMs: number,
  ttlDays: number
): boolean {
  if (createdAt === null || createdAt === undefined) return false
  const ms = new Date(createdAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return false
  return ms < nowMs - ttlDays * 24 * 60 * 60 * 1000
}
