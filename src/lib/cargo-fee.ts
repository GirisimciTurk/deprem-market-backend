import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

/**
 * Desi-bazlı kargo ücreti hesabı (satıcı maliyeti). Trendyol modeli: kargo ücreti
 * gönderinin desi'sine göre bulunur ve satıcının hakedişinden düşülür.
 *
 * Tutarlar kuruş. Desi şu an AĞIRLIK üzerinden hesaplanır (ürün boyutları yok):
 * desi ≈ ceil(toplam_gram / 1000), minimum 1. Gerçek hacimsel desi (en×boy×yük/3000)
 * ileride ürün boyutları girilince eklenebilir.
 */

export type CargoTier = { max_desi: number; fee: number }

export type CargoTariff = {
  tiers: CargoTier[]
  per_extra_fee: number
}

/** Varsayılan tarife (admin kendi Yurtiçi anlaşmasına göre değiştirir). Kuruş. */
export const DEFAULT_CARGO_TARIFF: CargoTariff = {
  tiers: [
    { max_desi: 1, fee: 5000 },
    { max_desi: 2, fee: 6000 },
    { max_desi: 3, fee: 7000 },
    { max_desi: 5, fee: 9000 },
    { max_desi: 10, fee: 13000 },
    { max_desi: 15, fee: 18000 },
    { max_desi: 20, fee: 23000 },
    { max_desi: 30, fee: 32000 },
  ],
  per_extra_fee: 1200,
}

/** Toplam gramdan desi: ceil(kg), minimum 1. */
export function computeDesi(totalGrams: number): number {
  const kg = Number(totalGrams) / 1000
  if (!Number.isFinite(kg) || kg <= 0) return 1
  return Math.max(1, Math.ceil(kg))
}

/** Hacimsel desi: (en × boy × yükseklik cm) / 3000. Boyut eksikse 0. */
export function volumetricDesi(
  lengthCm?: number | null,
  widthCm?: number | null,
  heightCm?: number | null
): number {
  const l = Number(lengthCm) || 0
  const w = Number(widthCm) || 0
  const h = Number(heightCm) || 0
  if (l <= 0 || w <= 0 || h <= 0) return 0
  return (l * w * h) / 3000
}

/**
 * Bir ürünün BİRİM desi'si — kargo standardı: hacimsel desi ile fiili ağırlığın
 * (kg) büyüğü. Boyut girilmemişse ağırlığa düşer. Toplamak için ceil edilmeden
 * döner (toplam sonra computeCargoFee içinde yukarı yuvarlanır).
 */
export function unitDesi(opts: {
  grams?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
}): number {
  const weightKg = (Number(opts.grams) || 0) / 1000
  const vol = volumetricDesi(opts.lengthCm, opts.widthCm, opts.heightCm)
  return Math.max(weightKg, vol)
}

/** Tarife + desi → kargo ücreti (kuruş). */
export function computeCargoFee(tariff: CargoTariff, desi: number): number {
  const tiers = [...(tariff.tiers || [])].sort((a, b) => a.max_desi - b.max_desi)
  if (tiers.length === 0) return 0
  const d = Math.max(1, Math.ceil(desi))
  for (const t of tiers) {
    if (d <= t.max_desi) return Math.max(0, Math.round(t.fee))
  }
  // Son kademeyi aştı → son ücret + aşan desi × per_extra_fee.
  const last = tiers[tiers.length - 1]
  const extra = (d - last.max_desi) * Number(tariff.per_extra_fee || 0)
  return Math.max(0, Math.round(last.fee + extra))
}

/** Aktif tarifeyi getirir; yoksa varsayılanı oluşturup döner (singleton). */
export async function getOrCreateCargoTariff(container: any): Promise<{ id: string; tiers: CargoTier[]; per_extra_fee: number }> {
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const existing = await marketplace.listCargoTariffs({}, { take: 1, order: { created_at: "ASC" } })
  if (existing.length > 0) return existing[0] as any
  const created = await marketplace.createCargoTariffs({
    tiers: DEFAULT_CARGO_TARIFF.tiers,
    per_extra_fee: DEFAULT_CARGO_TARIFF.per_extra_fee,
  } as any)
  return (Array.isArray(created) ? created[0] : created) as any
}

/** Tarifeyi salt-okunur getirir (yoksa varsayılan, DB'ye yazmaz). */
export async function readCargoTariff(container: any): Promise<CargoTariff> {
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const existing = await marketplace.listCargoTariffs({}, { take: 1, order: { created_at: "ASC" } })
  if (existing.length > 0) {
    const t = existing[0] as any
    return { tiers: t.tiers || DEFAULT_CARGO_TARIFF.tiers, per_extra_fee: Number(t.per_extra_fee ?? 0) }
  }
  return DEFAULT_CARGO_TARIFF
}
