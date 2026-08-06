/**
 * Push bildirimlerinin dili.
 *
 * `push_subscription.locale` alanı abonelik kurulurken yazılıyordu ama hiçbir
 * gönderimde OKUNMUYORDU: metin ve URL sabit Türkçe kuruluyor, İngilizce
 * kullanan müşteriye Türkçe bildirim ve `/tr/...` bağlantısı gidiyordu. Aynı
 * uyarı artık müşterinin TÜM cihazlarına yayıldığı için bu daha da görünür.
 *
 * Storefront `next-intl` ile tr/en sunuyor; burada yalnız bildirim metinleri
 * gerektiği için küçük ve bağımlılıksız bir eşleme tutuluyor.
 */
export const PUSH_LOCALES = ["tr", "en"] as const
export type PushLocale = (typeof PUSH_LOCALES)[number]

export const DEFAULT_PUSH_LOCALE: PushLocale = "tr"

/** "tr-TR", "EN", null gibi girdileri desteklenen bir locale'e indirger. */
export function normalizePushLocale(value?: string | null): PushLocale {
  const base = String(value ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0]
  return (PUSH_LOCALES as readonly string[]).includes(base)
    ? (base as PushLocale)
    : DEFAULT_PUSH_LOCALE
}

/**
 * Storefront yol öneki DİL DEĞİL ÜLKE KODUDUR (`app/[countryCode]/...`).
 * next-intl "URL routing'siz" modda çalışıyor: dil çerezden okunur, yola
 * yansımaz. Bu yüzden bildirim METNİ locale'e göre kurulur ama HEDEF YOL
 * ülke koduyla kalır — `/en/products/...` var olmayan bir rotadır.
 *
 * Tek bölge (TR) yayında olduğu için varsayılan sabit; çok bölgeli yayına
 * geçilirse abonelikte ülke kodu da saklanmalı.
 */
export const DEFAULT_COUNTRY_CODE = "tr"

export function productUrl(
  handle?: string | null,
  countryCode: string = DEFAULT_COUNTRY_CODE
): string {
  return handle
    ? `/${countryCode}/products/${handle}`
    : `/${countryCode}/store`
}

const BACK_IN_STOCK = {
  tr: {
    title: "Stoğa geldi! 🎉",
    body: (name: string) => `“${name}” yeniden stokta. Tükenmeden sipariş verin.`,
    action: "Ürüne git",
    fallbackName: "Beklediğiniz ürün",
  },
  en: {
    title: "Back in stock! 🎉",
    body: (name: string) => `“${name}” is available again. Order before it sells out.`,
    action: "View product",
    fallbackName: "The product you were waiting for",
  },
} satisfies Record<PushLocale, Record<string, unknown>>

/** "Stoğa geldi" bildiriminin locale'e göre metni + hedefi. */
export function backInStockPayload(
  locale: PushLocale,
  input: { productTitle: string; productHandle?: string | null; variantId: string }
) {
  const m = BACK_IN_STOCK[locale]
  return {
    title: m.title,
    body: m.body(input.productTitle),
    url: productUrl(input.productHandle),
    tag: `stock-${input.variantId}`,
    // Bildirim altı buton → doğrudan ürün sayfası (ana url ile aynı hedef).
    actions: [{ action: "view", title: m.action }],
  }
}

/**
 * Ürün adı bilinmiyorsa kullanılacak yedek ad.
 *
 * Katalogdan okunur (ternary DEĞİL): yeni bir dil eklendiğinde `satisfies`
 * eksik çeviriyi derleme zamanında yakalasın, sessizce Türkçeye düşmesin.
 */
export function fallbackProductName(locale: PushLocale): string {
  return BACK_IN_STOCK[locale].fallbackName
}

/** Hesap/sipariş ve sepet yolları — dil değil ÜLKE KODU önekli (bkz. productUrl). */
export function orderDetailUrl(
  orderId: string,
  countryCode: string = DEFAULT_COUNTRY_CODE
): string {
  return `/${countryCode}/account/orders/details/${orderId}`
}

export function ordersUrl(countryCode: string = DEFAULT_COUNTRY_CODE): string {
  return `/${countryCode}/account/orders`
}

export function cartUrl(countryCode: string = DEFAULT_COUNTRY_CODE): string {
  return `/${countryCode}/cart`
}

export type OrderPushStatus = "placed" | "shipped" | "delivered" | "canceled"

const ORDER = {
  tr: {
    placed: (no: string) => ({
      title: "Siparişiniz alındı ✅",
      body: `#${no} numaralı siparişiniz başarıyla oluşturuldu.`,
    }),
    shipped: (no: string) => ({
      title: "Siparişiniz kargoda 🚚",
      body: `#${no} numaralı siparişiniz kargoya verildi.`,
    }),
    delivered: (no: string) => ({
      title: "Siparişiniz teslim edildi 📦",
      // "Afiyet olsun" afet hazırlık ürünleri için bağlam dışıydı.
      body: `#${no} numaralı siparişiniz teslim edildi.`,
    }),
    canceled: (no: string) => ({
      title: "Siparişiniz iptal edildi",
      body: `#${no} numaralı siparişiniz iptal edildi.`,
    }),
    viewOrder: "Siparişi gör",
    myOrders: "Siparişlerim",
  },
  en: {
    placed: (no: string) => ({
      title: "Order received ✅",
      body: `Your order #${no} has been placed successfully.`,
    }),
    shipped: (no: string) => ({
      title: "Order shipped 🚚",
      body: `Your order #${no} is on its way.`,
    }),
    delivered: (no: string) => ({
      title: "Order delivered 📦",
      body: `Your order #${no} has been delivered.`,
    }),
    canceled: (no: string) => ({
      // AmE: storefront en.json üslubu ve koddaki `canceled` literaliyle tutarlı.
      title: "Order canceled",
      body: `Your order #${no} has been canceled.`,
    }),
    viewOrder: "View order",
    myOrders: "My orders",
  },
} satisfies Record<PushLocale, Record<string, unknown>>

/** Sipariş durumu bildiriminin locale'e göre metni + hedefi. */
type PushAction = { action: string; title: string; url?: string }

export function orderPushPayload(
  locale: PushLocale,
  input: { status: OrderPushStatus; orderNo: string; orderId: string }
) {
  const m = ORDER[locale]
  const copy = m[input.status](input.orderNo)
  // İptalde detay yerine sipariş listesi daha anlamlı.
  const actions: PushAction[] =
    input.status === "canceled"
      ? [{ action: "orders", title: m.myOrders, url: ordersUrl() }]
      : [{ action: "view", title: m.viewOrder }]
  return {
    ...copy,
    url: orderDetailUrl(input.orderId),
    tag: `order-${input.orderId}`,
    actions,
  }
}

const CART_RECOVERY = {
  tr: {
    title: "Sepetiniz sizi bekliyor 🛒",
    body: (n: number) => `${n} ürün sepetinizde duruyor. Tamamlamak ister misiniz?`,
  },
  en: {
    title: "Your cart is waiting 🛒",
    body: (n: number) =>
      n === 1
        ? "1 item is still in your cart. Want to complete your order?"
        : `${n} items are still in your cart. Want to complete your order?`,
  },
} satisfies Record<PushLocale, Record<string, unknown>>

/** Terk edilmiş sepet hatırlatmasının locale'e göre metni + hedefi. */
export function cartRecoveryPayload(
  locale: PushLocale,
  input: { itemCount: number; cartId: string }
) {
  const m = CART_RECOVERY[locale]
  return {
    title: m.title,
    body: m.body(input.itemCount),
    url: cartUrl(),
    tag: `cart-recovery-${input.cartId}`,
  }
}

/**
 * Abonelikleri diline göre gruplar (locale yoksa/geçersizse varsayılana düşer).
 *
 * Hem `sendToCustomerLocalized` hem `notifyBackInStock` aynı gruplamayı
 * yapıyordu; kural tek yerde dursun ki biri düzeltilip diğeri unutulmasın.
 */
export function groupByLocale<T extends { locale?: string | null }>(
  items: T[]
): Map<PushLocale, T[]> {
  const out = new Map<PushLocale, T[]>()
  for (const item of items) {
    const loc = normalizePushLocale(item.locale)
    out.set(loc, [...(out.get(loc) ?? []), item])
  }
  return out
}
