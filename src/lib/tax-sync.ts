import { Modules } from "@medusajs/framework/utils"

/**
 * Ürün başına KDV oranını NATIVE Medusa Tax Module'e senkronlar.
 *
 * Model: TR tax region'ında bir DEFAULT oran (KDV %20) var. Farklı KDV oranlı
 * ürünler (ör. gıda %1, %10) için o region'da non-default "bracket" tax rate'leri
 * oluşturulur ve ürün, `reference:"product"` rule'u ile o orana bağlanır. Default
 * orandaki ürünler için rule GEREKMEZ (region default'una düşer).
 *
 * Tek doğruluk kaynağı: product.metadata.vat_rate (%). Bu helper hem ürün
 * oluşturma/güncellemede çağrılır hem de setup:tax backfill'inde.
 *
 * ASLA throw etmez — tax senkronu ürün akışını bozmamalı (best-effort).
 */

const TR_COUNTRY = "tr"

type TaxService = any

async function getTrRegion(tax: TaxService) {
  const regions = await tax.listTaxRegions({ country_code: TR_COUNTRY })
  return (regions as any[])[0] || null
}

/** Region'ın default (is_default) oranını döndürür; yoksa 20 varsayar. */
function defaultRateOf(rates: any[]): number {
  const def = rates.find((r) => r.is_default)
  return def ? Number(def.rate) : 20
}

/** Verilen oran için non-default bracket tax rate'ini bulur, yoksa oluşturur. */
async function ensureBracketRate(
  tax: TaxService,
  regionId: string,
  rate: number
): Promise<string | null> {
  // TAZE oku (create öncesi son kontrol → eşzamanlı çağrılarda duplikat bracket
  // yaratma penceresini daraltır; TaxRate'te (region,rate) DB-unique yok).
  const fresh = await tax.listTaxRates({ tax_region_id: regionId })
  const existing = (fresh as any[]).find((r) => !r.is_default && Number(r.rate) === rate)
  if (existing) return existing.id
  try {
    const created = await tax.createTaxRates([
      {
        tax_region_id: regionId,
        name: `KDV %${rate}`,
        code: `KDV-${rate}`,
        rate,
        is_default: false,
      },
    ])
    return (created as any[])[0]?.id || null
  } catch {
    const after = await tax.listTaxRates({ tax_region_id: regionId })
    return (after as any[]).find((r) => !r.is_default && Number(r.rate) === rate)?.id || null
  }
}

/**
 * Bir ürünün KDV oranını native tax rate rule'una yansıtır.
 * @param vatRate ürünün KDV %'si (null/undefined → default orana düşer)
 */
export async function syncProductTaxRate(
  container: any,
  productId: string,
  vatRate: number | null | undefined
): Promise<void> {
  const logger = container.resolve("logger")
  try {
    const tax: TaxService = container.resolve(Modules.TAX)
    const region = await getTrRegion(tax)
    if (!region) {
      logger?.warn?.("[tax-sync] TR tax region yok — setup:tax / seed gerekli.")
      return
    }
    const rates = await tax.listTaxRates({ tax_region_id: region.id })
    const defaultRate = defaultRateOf(rates)

    // 1) Bu ürünün TÜM mevcut product-rule'larını kaldır (hangi bracket olursa olsun).
    const existingRules = await tax.listTaxRateRules({
      reference: "product",
      reference_id: productId,
    })
    if ((existingRules as any[]).length > 0) {
      await tax.deleteTaxRateRules((existingRules as any[]).map((r) => r.id))
    }

    // 2) Oran geçersiz ya da default'a eşitse → rule eklemeden çık (default'a düşer).
    const vr = vatRate == null ? null : Number(vatRate)
    if (vr == null || Number.isNaN(vr) || vr < 0 || vr === defaultRate) {
      return
    }

    // 3) Bracket rate'i bul/oluştur + ürünü bağla.
    const bracketRateId = await ensureBracketRate(tax, region.id, vr)
    if (!bracketRateId) {
      logger?.warn?.(`[tax-sync] KDV %${vr} bracket rate oluşturulamadı (ürün ${productId}).`)
      return
    }
    await tax.createTaxRateRules([
      { tax_rate_id: bracketRateId, reference: "product", reference_id: productId },
    ])
  } catch (e: any) {
    logger?.error?.(`[tax-sync] ürün ${productId} KDV senkronu başarısız: ${e?.message}`)
  }
}

/** Ürünün metadata.vat_rate'ini okuyup syncProductTaxRate çağırır (kolaylık). */
export async function syncProductTaxFromMetadata(
  container: any,
  productId: string
): Promise<void> {
  try {
    const product: any = container.resolve(Modules.PRODUCT)
    const p = await product.retrieveProduct(productId, { select: ["id", "metadata"] })
    const vr = (p?.metadata as any)?.vat_rate
    await syncProductTaxRate(container, productId, vr == null ? null : Number(vr))
  } catch {
    /* best-effort */
  }
}
