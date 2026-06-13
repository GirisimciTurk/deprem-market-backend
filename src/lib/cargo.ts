/**
 * Merkezi kargo (carrier) yapılandırması.
 *
 * Tek doğruluk kaynağı: kargo firması tanımları + takip URL üretimi burada.
 * Hem fulfillment provider, hem order-shipped e-posta subscriber'ı, hem de
 * (kopyası) storefront bu mantığı kullanır.
 *
 * Yeni bir firma eklemek için CARRIERS'a bir satır eklemen yeterli.
 */

export type CarrierCode = "yurtici" | "mng" | "ptt"

export interface CarrierDef {
  code: CarrierCode
  /** Müşteriye gösterilecek isim */
  name: string
  /**
   * Takip URL şablonu. `{code}` yer tutucusu takip numarasıyla değiştirilir.
   * Boş ise (manual) takip linki üretilmez.
   */
  trackingUrlTemplate: string
}

/**
 * Yurtiçi takip URL şablonu. Yurtiçi'nin kamuya açık takip sayfası sözleşmeye
 * göre değişebildiği için env ile override edilebilir.
 */
const YURTICI_TRACKING_URL_TEMPLATE =
  process.env.YURTICI_TRACKING_URL_TEMPLATE ||
  "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={code}"

export const CARRIERS: Record<CarrierCode, CarrierDef> = {
  yurtici: {
    code: "yurtici",
    name: "Yurtiçi Kargo",
    trackingUrlTemplate: YURTICI_TRACKING_URL_TEMPLATE,
  },
  mng: {
    code: "mng",
    name: "MNG Kargo",
    trackingUrlTemplate:
      "https://service.mngkargo.com.tr/iframe/iframe.aspx?KODNO={code}",
  },
  ptt: {
    code: "ptt",
    name: "PTT Kargo",
    trackingUrlTemplate: "https://gonderitakip.ptt.gov.tr/Track/Verify?q={code}",
  },
}

/** Varsayılan kargo firması (env ile override edilebilir). */
export const DEFAULT_CARRIER: CarrierCode =
  (process.env.DEFAULT_CARGO_CARRIER as CarrierCode) || "yurtici"

/**
 * Bir fulfillment provider_id'sinden ("yurtici_kargo", "manual_manual" ...)
 * kargo firmasını çözer. Bilinmeyen/manuel provider için DEFAULT_CARRIER döner —
 * çünkü manuel fulfillment'lar da gerçekte Yurtiçi ile gönderiliyor.
 */
export function resolveCarrier(providerId?: string | null): CarrierDef {
  if (providerId) {
    const prefix = providerId.split("_")[0] as CarrierCode
    if (prefix && CARRIERS[prefix]) {
      return CARRIERS[prefix]
    }
  }
  return CARRIERS[DEFAULT_CARRIER]
}

/**
 * Takip numarası + (opsiyonel) provider_id'den müşteriye gösterilecek
 * "Kargom Nerede?" linkini üretir. Link üretilemiyorsa null döner.
 */
export function getTrackingUrl(
  trackingNumber: string,
  providerId?: string | null
): string | null {
  const code = (trackingNumber || "").trim()
  if (!code) return null
  const carrier = resolveCarrier(providerId)
  if (!carrier.trackingUrlTemplate) return null
  return carrier.trackingUrlTemplate.replace("{code}", encodeURIComponent(code))
}
