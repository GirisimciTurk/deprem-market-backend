import { computeCargoFee, unitDesi, CargoTariff } from "./cargo-fee"

/**
 * MÜŞTERİ kargo ücreti hesabı (desi-bazlı). split-order.ts'teki desi mantığının
 * (lib/cargo-fee.ts) aynısını kullanır; fark, sonucun SATICI payout'undan değil
 * MÜŞTERİDEN alınmasıdır. Çok-satıcılı sepette her satıcının desi'si + ücretsiz
 * kargo kuralı AYRI değerlendirilir, sonra toplanır (tek kargo satırı).
 *
 * Tüm tutarlar kuruş (minor unit). free_shipping_threshold TRY major:
 *   null → ücretli, 0 → her zaman ücretsiz, > 0 → satıcı ara toplamı ≥ eşik ise ücretsiz.
 */

export type CargoItem = {
  seller_id: string | null
  /** Satıcının ücretsiz kargo kuralı (TRY major). Grup içindeki tüm kalemlerde aynı. */
  free_shipping_threshold: number | null
  /** Fiili ağırlık (gram) — desi için. */
  grams: number
  lengthCm: number
  widthCm: number
  heightCm: number
  quantity: number
  /** Kalem ara toplamı (kuruş) — ücretsiz kargo eşiği karşılaştırması için. */
  line_subtotal: number
}

export type SellerCargo = {
  seller_id: string | null
  desi: number
  /** Satıcının sepetteki ara toplamı (kuruş). */
  subtotal: number
  /** Ücretsiz öncesi desi-bazlı ücret (kuruş). */
  raw_fee: number
  /** Ücretsiz kuralı uygulandıktan sonraki ücret (kuruş). */
  fee: number
  free: boolean
}

export type CartCargo = {
  /** Müşteriden alınacak toplam kargo (kuruş). */
  total: number
  sellers: SellerCargo[]
}

/**
 * Sepet kalemlerinden müşteri kargo ücretini hesaplar. Saf fonksiyon (DB yok) —
 * hem store tahmin endpoint'i hem fulfillment provider (calculatePrice) kullanır.
 */
export function computeCartCargo(items: CargoItem[], tariff: CargoTariff): CartCargo {
  const groups = new Map<string, CargoItem[]>()
  for (const it of items) {
    const key = it.seller_id ?? "__none__"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(it)
  }

  const sellers: SellerCargo[] = []
  for (const [key, its] of groups) {
    const desi = its.reduce(
      (s, it) =>
        s +
        unitDesi({
          grams: it.grams,
          lengthCm: it.lengthCm,
          widthCm: it.widthCm,
          heightCm: it.heightCm,
        }) *
          Math.max(1, Number(it.quantity) || 1),
      0
    )
    const subtotal = its.reduce((s, it) => s + (Number(it.line_subtotal) || 0), 0)
    const raw_fee = computeCargoFee(tariff, desi)

    // Eşik grup genelinde aynı; ilk tanımlı değeri al.
    const thr = its.find((it) => it.free_shipping_threshold != null)?.free_shipping_threshold ?? null
    let free = false
    if (thr === 0) free = true
    else if (thr != null && thr > 0 && subtotal >= thr * 100) free = true

    sellers.push({
      seller_id: key === "__none__" ? null : key,
      desi,
      subtotal,
      raw_fee,
      fee: free ? 0 : raw_fee,
      free,
    })
  }

  const total = sellers.reduce((s, x) => s + x.fee, 0)
  return { total, sellers }
}

/** Kalem metadata'sına damgalanan satıcı kargo bilgisi (cart.updated subscriber yazar). */
export type LineShipMeta = { s: string | null; f: number | null }
export const LINE_SHIP_META_KEY = "dt_ship"
