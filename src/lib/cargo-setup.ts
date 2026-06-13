import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Yurtiçi Kargo altyapısını kurar (idempotent). Hem `npm run setup:cargo` script'i
 * hem de `POST /admin/cargo-setup` endpoint'i bunu çağırır (prod imajında script
 * çalıştırılamadığı için endpoint şart — marketplace-setup ile aynı desen).
 *
 *  1. `yurtici_kargo` provider'ını stok lokasyonuna bağlar.
 *  2. Eski İngilizce starter + eski Aras shipping option'larını temizler.
 *  3. Yurtiçi Standart / Hızlı / Ücretsiz Kargo seçeneklerini Türkiye zone'una kurar.
 */
const CARGO_PROVIDER_ID = "yurtici_kargo"
const STARTER_OPTION_NAMES = ["Standard Shipping", "Express Shipping"]
const CARGO_OPTION_NAMES = [
  "Yurtiçi Kargo - Standart",
  "Yurtiçi Kargo - Hızlı",
  "Ücretsiz Kargo",
]
// Eski Aras isimleri — re-run'da temizlenir (Aras tamamen kaldırıldı).
const LEGACY_ARAS_OPTION_NAMES = ["Aras Kargo - Standart", "Aras Kargo - Hızlı"]
// Tutarlar minor unit (kuruş): 50 TL = 5000.
const MINOR = 100

export async function runCargoSetup(container: any): Promise<{ created: string[]; kept: string[] }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const freeShippingThreshold = process.env.FREE_SHIPPING_THRESHOLD_TRY
    ? Number(process.env.FREE_SHIPPING_THRESHOLD_TRY)
    : 1000

  logger.info("[setup-cargo] Yurtiçi Kargo altyapısı kuruluyor...")

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  if (!stockLocations.length) {
    throw new Error("[setup-cargo] Stok lokasyonu bulunamadı. Önce seed çalıştırılmalı.")
  }
  const stockLocation = stockLocations[0]

  const { data: serviceZones } = await query.graph({
    entity: "service_zone",
    fields: ["id", "name", "geo_zones.country_code"],
  })
  const turkeyZone =
    serviceZones.find((z: any) =>
      (z.geo_zones || []).some((g: any) => (g.country_code || "").toLowerCase() === "tr")
    ) || serviceZones.find((z: any) => /turk/i.test(z.name || ""))
  if (!turkeyZone) {
    throw new Error("[setup-cargo] Türkiye servis bölgesi (service zone) bulunamadı.")
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
  })
  const shippingProfile =
    shippingProfiles.find((p: any) => p.type === "default") || shippingProfiles[0]
  if (!shippingProfile) {
    throw new Error("[setup-cargo] Shipping profile bulunamadı.")
  }

  logger.info(
    `[setup-cargo] Lokasyon: ${stockLocation.name} | Zone: ${turkeyZone.name} | Profile: ${shippingProfile.name}`
  )

  // Provider'ı lokasyona bağla (idempotent).
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: CARGO_PROVIDER_ID },
    })
    logger.info(`[setup-cargo] '${CARGO_PROVIDER_ID}' provider'ı lokasyona bağlandı.`)
  } catch (e: any) {
    logger.info(`[setup-cargo] Provider link zaten mevcut olabilir (atlanıyor): ${e?.message}`)
  }

  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id"],
  })

  // GUARD: Sipariş tarafından kullanılan option SİLİNMEMELİ (fulfillment bozulur).
  const { data: ordersWithSO } = await query.graph({
    entity: "order",
    fields: ["shipping_methods.shipping_option_id"],
  })
  const referencedOptionIds = new Set<string>()
  for (const o of ordersWithSO) {
    for (const sm of (o as any).shipping_methods || []) {
      if (sm?.shipping_option_id) referencedOptionIds.add(sm.shipping_option_id)
    }
  }

  const removeNames = [...STARTER_OPTION_NAMES, ...LEGACY_ARAS_OPTION_NAMES, ...CARGO_OPTION_NAMES]
  const removeIds = existingOptions
    .filter((o: any) => removeNames.includes(o.name) && !referencedOptionIds.has(o.id))
    .map((o: any) => o.id)
  if (removeIds.length) {
    try {
      await deleteShippingOptionsWorkflow(container).run({ input: { ids: removeIds } })
      logger.info(`[setup-cargo] ${removeIds.length} kullanılmayan kargo seçeneği silindi.`)
    } catch (e: any) {
      logger.warn(`[setup-cargo] Seçenekler silinemedi (atlanıyor): ${e?.message}`)
    }
  }
  const keptReferenced = existingOptions.filter(
    (o: any) => removeNames.includes(o.name) && referencedOptionIds.has(o.id)
  )

  const existingNames = new Set<string>(
    keptReferenced.filter((o: any) => CARGO_OPTION_NAMES.includes(o.name)).map((o: any) => o.name as string)
  )

  const baseRules = [
    { attribute: "enabled_in_store", value: "true", operator: "eq" },
    { attribute: "is_return", value: "false", operator: "eq" },
  ]
  const optionsToCreate: any[] = []

  if (!existingNames.has("Yurtiçi Kargo - Standart")) {
    optionsToCreate.push({
      name: "Yurtiçi Kargo - Standart",
      price_type: "flat",
      provider_id: CARGO_PROVIDER_ID,
      service_zone_id: turkeyZone.id,
      shipping_profile_id: shippingProfile.id,
      type: { label: "Standart", description: "Yurtiçi Kargo ile 2-3 iş günü içinde teslimat.", code: "standard" },
      prices: [{ currency_code: "try", amount: 50 * MINOR }],
      rules: baseRules,
    })
  }
  if (!existingNames.has("Yurtiçi Kargo - Hızlı")) {
    optionsToCreate.push({
      name: "Yurtiçi Kargo - Hızlı",
      price_type: "flat",
      provider_id: CARGO_PROVIDER_ID,
      service_zone_id: turkeyZone.id,
      shipping_profile_id: shippingProfile.id,
      type: { label: "Hızlı", description: "Yurtiçi Kargo ile ertesi gün teslimat.", code: "express" },
      prices: [{ currency_code: "try", amount: 100 * MINOR }],
      rules: baseRules,
    })
  }
  if (!existingNames.has("Ücretsiz Kargo")) {
    optionsToCreate.push({
      name: "Ücretsiz Kargo",
      price_type: "flat",
      provider_id: CARGO_PROVIDER_ID,
      service_zone_id: turkeyZone.id,
      shipping_profile_id: shippingProfile.id,
      type: { label: "Ücretsiz", description: `${freeShippingThreshold}₺ ve üzeri siparişlerde ücretsiz Yurtiçi Kargo.`, code: "free" },
      prices: [{ currency_code: "try", amount: 0 }],
      rules: [
        ...baseRules,
        { attribute: "item_total", value: (freeShippingThreshold * MINOR).toFixed(2), operator: "gte" },
      ],
    })
  }

  if (optionsToCreate.length) {
    await createShippingOptionsWorkflow(container).run({ input: optionsToCreate })
    logger.info(`[setup-cargo] ${optionsToCreate.length} Yurtiçi kargo seçeneği oluşturuldu.`)
  } else {
    logger.info("[setup-cargo] Tüm Yurtiçi kargo seçenekleri zaten mevcut (atlanıyor).")
  }

  logger.info(`[setup-cargo] Tamamlandı. Ücretsiz kargo eşiği: ${freeShippingThreshold}₺.`)
  return {
    created: optionsToCreate.map((o) => o.name),
    kept: keptReferenced.map((o: any) => o.name),
  }
}
