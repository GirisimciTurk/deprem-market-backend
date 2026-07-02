/**
 * Sabit "vitrin" kategorileri — normal kategori ağacının DIŞINDA, satıcının ürün
 * girerken bir veya daha fazlasını seçebildiği DEĞİŞMEYEN etiketler. Ürün üzerinde
 * `product.metadata.showcase` (stable key dizisi) olarak saklanır. Storefront ana
 * sayfa vitrin bölümleri bu key'lerle beslenebilir (örn. "deals" → Fırsat Ürünleri).
 *
 * Not: "En Çok Satanlar"/"Yeni Ürünler" burada MANUEL seçilebilir etiketlerdir
 * (satıcı isteğiyle); satış/tarih bazlı otomatik hesap istenirse ayrıca eklenebilir.
 */
export const SHOWCASE_CATEGORIES = [
  { key: "bestsellers", label: "En Çok Satanlar" },
  { key: "new-arrivals", label: "Yeni Ürünler" },
  { key: "deals", label: "Fırsat Ürünleri" },
  { key: "bundles", label: "Set ve Paket İndirimleri" },
  { key: "campaigns", label: "Özel Kampanyalar" },
  { key: "seasonal", label: "Sezonluk ve Limited Ürünler" },
] as const

export type ShowcaseKey = (typeof SHOWCASE_CATEGORIES)[number]["key"]

export const SHOWCASE_KEYS = new Set<string>(SHOWCASE_CATEGORIES.map((c) => c.key))

/** Girdi dizisinden yalnız GEÇERLİ + tekilleştirilmiş vitrin key'lerini süzer. */
export function sanitizeShowcaseKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    const k = String(v ?? "").trim()
    if (SHOWCASE_KEYS.has(k) && !out.includes(k)) out.push(k)
  }
  return out
}
