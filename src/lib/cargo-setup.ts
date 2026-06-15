import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
  updateShippingOptionsWorkflow,
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
// provider_id GERİYE DÖNÜK UYUMLU "aras_kargo" (mevcut fulfillment/option'lar buna
// bağlı; değiştirmek fp_aras_kargo çözümünü bozar). Görünen her şey Yurtiçi.
const CARGO_PROVIDER_ID = "aras_kargo"
const STARTER_OPTION_NAMES = ["Standard Shipping", "Express Shipping"]
const CARGO_OPTION_NAMES = [
  "Yurtiçi Kargo - Standart",
  "Yurtiçi Kargo - Hızlı",
  "Ücretsiz Kargo",
]
// Eski Aras isimli option'lar → Yurtiçi'ye YENİDEN ADLANDIRILIR (silinmez; sipariş
// referanslarını + provider bağını korur). [eskiAd, yeniAd]
const ARAS_RENAME: [string, string][] = [
  ["Aras Kargo - Standart", "Yurtiçi Kargo - Standart"],
  ["Aras Kargo - Hızlı", "Yurtiçi Kargo - Hızlı"],
]
// Tutarlar minor unit (kuruş): 50 TL = 5000.
const MINOR = 100

export async function runCargoSetup(container: any): Promise<{ created: string[]; kept: string[] }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

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

  let { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id", "price_type"],
  })

  // Eski "Aras Kargo - X" option'larını "Yurtiçi Kargo - X"e yeniden adlandır
  // (silme yok → sipariş referansları + provider bağı korunur). Müşteri artık
  // checkout'ta Aras görmez.
  const renames = ARAS_RENAME.flatMap(([oldName, newName]) =>
    (existingOptions as any[])
      .filter((o) => o.name === oldName)
      .map((o) => ({ id: o.id, name: newName }))
  )
  if (renames.length > 0) {
    try {
      await updateShippingOptionsWorkflow(container).run({ input: renames as any })
      logger.info(`[setup-cargo] ${renames.length} eski Aras seçeneği Yurtiçi'ye yeniden adlandırıldı.`)
      // Yerel listeyi güncelle ki create adımı duplicate üretmesin.
      for (const r of renames) {
        const opt = (existingOptions as any[]).find((o) => o.id === r.id)
        if (opt) opt.name = r.name
      }
    } catch (e: any) {
      logger.warn(`[setup-cargo] Aras→Yurtiçi yeniden adlandırma atlandı: ${e?.message}`)
    }
  }

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

  // MÜŞTERİ kargosu artık DESİ-BAZLI (calculated): tek "Yurtiçi Kargo - Standart"
  // calculated seçeneği sunulur; ücret sepete göre fulfillment provider'da hesaplanır
  // (lib/cart-cargo + yurtici-kargo/service.calculatePrice). Ücretsiz kargo artık
  // SATICI kararıdır (seller.free_shipping_threshold) ve hesabın içinde uygulanır;
  // bu yüzden eski flat "Standart/Hızlı" ve global "Ücretsiz Kargo" KALDIRILIR.
  // Idempotent: zaten calculated olan Standart korunur, yalnız eski flat'ler silinir.
  const calcStandartExists = (existingOptions as any[]).some(
    (o) => o.name === "Yurtiçi Kargo - Standart" && o.price_type === "calculated"
  )

  // Temizlik adayları: eski İngilizce starter + Hızlı + global Ücretsiz + FLAT Standart.
  // (Calculated Standart asla silinmez; referans alınanlar da korunur.)
  const removeNames = [...STARTER_OPTION_NAMES, "Yurtiçi Kargo - Hızlı", "Ücretsiz Kargo"]
  const removeIds = (existingOptions as any[])
    .filter((o) => !referencedOptionIds.has(o.id))
    .filter(
      (o) =>
        removeNames.includes(o.name) ||
        (o.name === "Yurtiçi Kargo - Standart" && o.price_type !== "calculated")
    )
    .map((o) => o.id)
  if (removeIds.length) {
    try {
      await deleteShippingOptionsWorkflow(container).run({ input: { ids: removeIds } })
      logger.info(`[setup-cargo] ${removeIds.length} eski/flat kargo seçeneği silindi.`)
    } catch (e: any) {
      logger.warn(`[setup-cargo] Seçenekler silinemedi (atlanıyor): ${e?.message}`)
    }
  }

  const baseRules = [
    { attribute: "enabled_in_store", value: "true", operator: "eq" },
    { attribute: "is_return", value: "false", operator: "eq" },
  ]
  const optionsToCreate: any[] = []

  if (!calcStandartExists) {
    optionsToCreate.push({
      name: "Yurtiçi Kargo - Standart",
      price_type: "calculated",
      provider_id: CARGO_PROVIDER_ID,
      service_zone_id: turkeyZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Standart",
        description: "Yurtiçi Kargo ile 2-3 iş günü içinde teslimat. Ücret desiye göre hesaplanır.",
        code: "standard",
      },
      // calculated → sabit fiyat yok; ücret provider.calculatePrice'tan gelir.
      rules: baseRules,
    })
  }

  if (optionsToCreate.length) {
    await createShippingOptionsWorkflow(container).run({ input: optionsToCreate })
    logger.info(`[setup-cargo] Desi-bazlı (calculated) Yurtiçi Kargo seçeneği oluşturuldu.`)
  } else {
    logger.info("[setup-cargo] Desi-bazlı Yurtiçi Kargo seçeneği zaten mevcut (atlanıyor).")
  }

  logger.info("[setup-cargo] Tamamlandı. Müşteri kargosu desi-bazlı; ücretsiz kargo satıcı kararı.")
  return {
    created: optionsToCreate.map((o) => o.name),
    kept: [],
  }
}
