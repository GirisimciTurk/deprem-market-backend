/**
 * Merkezi PayTR (Pazaryeri) yapılandırması.
 *
 * Kimlik bilgileri ortam değişkenlerinden okunur. Production'da ZORUNLU →
 * eksikse fail-closed (throw); böylece yanlışlıkla yapılandırmasız canlıya
 * çıkılmaz. PayTR'ın Paynkolay gibi kamuya açık TEST merchant'ı YOKTUR; bu
 * yüzden dev'de eksik bilgiyle `configured:false` döner (çağrı yerleri sessizce
 * devre dışı kalır). Gerçek test, PayTR hesabınızın test_mode=1 ayarıyla yapılır.
 */

export interface PayTRConfig {
  merchantId: string
  merchantKey: string
  merchantSalt: string
  /** "1" → PayTR gerçek para çekmez (test). "0" → canlı. */
  testMode: "0" | "1"
  /** PayTR API kök adresi (https://www.paytr.com). */
  baseUrl: string
  /** Ödeme sonrası kullanıcının döneceği storefront sayfaları (iframe). */
  okUrl: string
  failUrl: string
  /** PayTR'ın sunucu-sunucu bildirim (callback) göndereceği backend ucu. */
  callbackUrl: string
  isProduction: boolean
  /** Üç kimlik de doluysa true. */
  configured: boolean
}

export function getPayTRConfig(): PayTRConfig {
  const isProduction = process.env.NODE_ENV === "production"

  const merchantId = process.env.PAYTR_MERCHANT_ID || ""
  const merchantKey = process.env.PAYTR_MERCHANT_KEY || ""
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT || ""

  // PayTR OPSİYONELDİR (henüz Pazaryeri hesabı yok; Paynkolay aktif). Bu yüzden
  // eksik kimlikte THROW ETMEYİZ — `configured:false` döneriz. Çağrı yerleri
  // (payout → manuel mod, token route → 503, transfer → error) bunu zaten ele alır.
  // Fail-closed davranış, gerçek bir PayTR işlemi denenmeden ÖNCE configured
  // kontrolüyle sağlanır; böylece PAYTR_* boşken mevcut akışlar (manuel payout)
  // kırılmaz.

  // Varsayılan: prod'da canlı ("0"), dev'de test ("1"). PAYTR_TEST_MODE ile override.
  const testMode: "0" | "1" =
    (process.env.PAYTR_TEST_MODE ?? (isProduction ? "0" : "1")) === "1"
      ? "1"
      : "0"

  const baseUrl = process.env.PAYTR_BASE_URL || "https://www.paytr.com"
  const backend = process.env.BACKEND_URL || "http://localhost:9000"
  const storefront =
    process.env.STOREFRONT_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "http://localhost:8000"

  const callbackUrl =
    process.env.PAYTR_CALLBACK_URL || `${backend}/paytr-callback`
  const okUrl =
    process.env.PAYTR_OK_URL || `${storefront}/tr/odeme/sonuc?status=success`
  const failUrl =
    process.env.PAYTR_FAIL_URL || `${storefront}/tr/odeme/sonuc?status=fail`

  return {
    merchantId,
    merchantKey,
    merchantSalt,
    testMode,
    baseUrl,
    okUrl,
    failUrl,
    callbackUrl,
    isProduction,
    configured: !!(merchantId && merchantKey && merchantSalt),
  }
}
