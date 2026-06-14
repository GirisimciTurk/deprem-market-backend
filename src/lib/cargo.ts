/**
 * Merkezi kargo (carrier) yapılandırması.
 *
 * Tek doğruluk kaynağı: kargo firması tanımları + takip URL üretimi burada.
 * Hem fulfillment provider, hem order-shipped e-posta subscriber'ı, hem de
 * (kopyası) storefront bu mantığı kullanır.
 *
 * Yeni bir firma eklemek için CARRIERS'a bir satır eklemen yeterli.
 *
 * Hibrit satıcı kargosu: DEFAULT_CARRIER (Yurtiçi) "anlaşmalı kargo"dur —
 * satıcının hak edişinden kargo ücreti düşülür. Diğer firmalar satıcının
 * kendi anlaşmasıdır → kargo ücreti düşülmez (bkz. isPlatformCarrier +
 * vendors/orders/[id]/fulfill).
 */

export type CarrierCode =
  | "yurtici"
  | "aras"
  | "mng"
  | "surat"
  | "ptt"
  | "ups"
  | "sendeo"
  | "hepsijet"
  | "diger"

export interface CarrierDef {
  code: CarrierCode
  /** Müşteriye gösterilecek isim */
  name: string
  /**
   * Takip URL şablonu. `{code}` yer tutucusu takip numarasıyla değiştirilir.
   * Boş ise (ör. "Diğer") takip linki üretilmez; satıcı linki elle girer.
   */
  trackingUrlTemplate: string
}

// Takip URL şablonları env ile override edilebilir (firmaların kamuya açık
// sorgu sayfaları zaman zaman değişir). Örn: ARAS_TRACKING_URL_TEMPLATE.
const tpl = (code: string, def: string): string =>
  process.env[`${code.toUpperCase()}_TRACKING_URL_TEMPLATE`] || def

export const CARRIERS: Record<CarrierCode, CarrierDef> = {
  yurtici: {
    code: "yurtici",
    name: "Yurtiçi Kargo",
    trackingUrlTemplate: tpl(
      "yurtici",
      "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={code}"
    ),
  },
  aras: {
    code: "aras",
    name: "Aras Kargo",
    trackingUrlTemplate: tpl(
      "aras",
      "https://kargotakip.araskargo.com.tr/?code={code}"
    ),
  },
  mng: {
    code: "mng",
    name: "MNG Kargo",
    trackingUrlTemplate: tpl(
      "mng",
      "https://service.mngkargo.com.tr/iframe/iframe.aspx?KODNO={code}"
    ),
  },
  surat: {
    code: "surat",
    name: "Sürat Kargo",
    trackingUrlTemplate: tpl(
      "surat",
      "https://www.suratkargo.com.tr/KargoTakip/?kargotakipno={code}"
    ),
  },
  ptt: {
    code: "ptt",
    name: "PTT Kargo",
    trackingUrlTemplate: tpl(
      "ptt",
      "https://gonderitakip.ptt.gov.tr/Track/Verify?q={code}"
    ),
  },
  ups: {
    code: "ups",
    name: "UPS Kargo",
    trackingUrlTemplate: tpl(
      "ups",
      "https://www.ups.com/track?loc=tr_TR&tracknum={code}"
    ),
  },
  sendeo: {
    code: "sendeo",
    name: "Sendeo",
    trackingUrlTemplate: tpl(
      "sendeo",
      "https://www.sendeo.com.tr/gonderi-takip?code={code}"
    ),
  },
  hepsijet: {
    code: "hepsijet",
    name: "Hepsijet",
    trackingUrlTemplate: tpl(
      "hepsijet",
      "https://www.hepsijet.com/gonderi-takibi?code={code}"
    ),
  },
  // "Diğer": listede olmayan firma. Takip linki üretilmez; satıcı isterse
  // takip URL'sini elle girer (vendors/orders/[id]/fulfill → tracking_url).
  diger: {
    code: "diger",
    name: "Diğer",
    trackingUrlTemplate: "",
  },
}

/** Tüm geçerli kargo kodları (zod enum, doğrulama vb. için). */
export const CARRIER_CODES = Object.keys(CARRIERS) as CarrierCode[]

/** Varsayılan / "anlaşmalı" kargo firması (env ile override edilebilir). */
export const DEFAULT_CARRIER: CarrierCode =
  (process.env.DEFAULT_CARGO_CARRIER as CarrierCode) || "yurtici"

/**
 * Bu firma platformun "anlaşmalı kargosu" mu? Anlaşmalı kargoda satıcının
 * hak edişinden kargo ücreti düşülür; satıcının kendi kargosunda düşülmez.
 */
export function isPlatformCarrier(code?: string | null): boolean {
  return code === DEFAULT_CARRIER
}

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
