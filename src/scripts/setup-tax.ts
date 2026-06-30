import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncProductTaxRate } from "../lib/tax-sync"

/**
 * setup:tax — mevcut tüm ürünlerin metadata.vat_rate'ini native Medusa Tax
 * Module'e (bracket tax rate + per-product rule) backfill eder. İdempotent;
 * re-run güvenli. KDV oranı default (region default, %20) olan ya da set
 * edilmemiş ürünler region default'una düşer (rule oluşturulmaz).
 *
 * Çalıştır: npm run setup:tax
 */
export default async function setupTax({ container }: { container: any }) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const tax: any = container.resolve(Modules.TAX)

  const regions = await tax.listTaxRegions({ country_code: "tr" })
  if (!regions?.length) {
    logger.error("[setup:tax] TR tax region yok. Önce seed/migration çalıştırın.")
    return
  }
  const rates = await tax.listTaxRates({ tax_region_id: regions[0].id })
  const def = rates.find((r: any) => r.is_default)
  logger.info(
    `[setup:tax] TR region ${regions[0].id} | default KDV %${def ? def.rate : "?"} | mevcut bracket sayısı: ${rates.filter((r: any) => !r.is_default).length}`
  )

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata"],
    pagination: { take: 5000 },
  })

  let withRate = 0
  let synced = 0
  const dist: Record<string, number> = {}
  for (const p of products as any[]) {
    const vr = (p.metadata as any)?.vat_rate
    const key = vr == null ? "default" : String(vr)
    dist[key] = (dist[key] || 0) + 1
    if (vr != null && !Number.isNaN(Number(vr))) withRate++
    await syncProductTaxRate(container, p.id, vr == null ? null : Number(vr))
    synced++
  }

  logger.info(`[setup:tax] ${synced} ürün senkronlandı (${withRate} tanesi açık KDV oranlı).`)
  logger.info(`[setup:tax] KDV dağılımı: ${JSON.stringify(dist)}`)
  const after = await tax.listTaxRates({ tax_region_id: regions[0].id })
  logger.info(
    `[setup:tax] Sonuç bracket oranları: ${after
      .filter((r: any) => !r.is_default)
      .map((r: any) => `%${r.rate}`)
      .join(", ") || "(yok)"}`
  )
}
