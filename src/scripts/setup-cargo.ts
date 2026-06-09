import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  deleteShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Aras Kargo altyapısını kurar (idempotent):
 *  1. `aras_kargo` provider'ını stok lokasyonuna bağlar.
 *  2. Eski İngilizce starter shipping option'larını (Standard/Express) temizler.
 *  3. Aras Standart / Aras Hızlı / Ücretsiz Kargo seçeneklerini Türkiye zone'una kurar.
 *
 * Çalıştırma:  npm run setup:cargo
 */
const ARAS_PROVIDER_ID = "aras_kargo"

const STARTER_OPTION_NAMES = ["Standard Shipping", "Express Shipping"]

const ARAS_OPTION_NAMES = [
  "Aras Kargo - Standart",
  "Aras Kargo - Hızlı",
  "Ücretsiz Kargo",
]

// Bu store tutarları minor unit (kuruş) tutuyor — storefront money util'i /100 yapar.
// Yani 50 TL = 5000, 1000 TL eşiği = 100000.
const MINOR = 100

export default async function setupCargo({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const freeShippingThreshold = process.env.FREE_SHIPPING_THRESHOLD_TRY
    ? Number(process.env.FREE_SHIPPING_THRESHOLD_TRY)
    : 1000

  logger.info("[setup-cargo] Aras Kargo altyapısı kuruluyor...")

  // --- 1. Gerekli kayıtları bul ------------------------------------------
  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  if (!stockLocations.length) {
    throw new Error(
      "[setup-cargo] Stok lokasyonu bulunamadı. Önce seed çalıştırılmalı."
    )
  }
  const stockLocation = stockLocations[0]

  const { data: serviceZones } = await query.graph({
    entity: "service_zone",
    fields: ["id", "name", "geo_zones.country_code"],
  })
  // Türkiye'yi kapsayan zone'u seç (adı "Turkey" ya da geo'da "tr" olan).
  const turkeyZone =
    serviceZones.find((z: any) =>
      (z.geo_zones || []).some(
        (g: any) => (g.country_code || "").toLowerCase() === "tr"
      )
    ) || serviceZones.find((z: any) => /turk/i.test(z.name || ""))
  if (!turkeyZone) {
    throw new Error("[setup-cargo] Türkiye servis bölgesi (service zone) bulunamadı.")
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
  })
  const shippingProfile =
    shippingProfiles.find((p: any) => p.type === "default") ||
    shippingProfiles[0]
  if (!shippingProfile) {
    throw new Error("[setup-cargo] Shipping profile bulunamadı.")
  }

  logger.info(
    `[setup-cargo] Lokasyon: ${stockLocation.name} | Zone: ${turkeyZone.name} | Profile: ${shippingProfile.name}`
  )

  // --- 2. Provider'ı lokasyona bağla (idempotent) ------------------------
  try {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: ARAS_PROVIDER_ID },
    })
    logger.info(
      `[setup-cargo] '${ARAS_PROVIDER_ID}' provider'ı lokasyona bağlandı.`
    )
  } catch (e: any) {
    logger.info(
      `[setup-cargo] Provider link zaten mevcut olabilir (atlanıyor): ${e?.message}`
    )
  }

  // --- 3. Mevcut shipping option'ları çek --------------------------------
  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id"],
  })

  // GUARD: Bir sipariş tarafından kullanılan shipping option SİLİNMEMELİ — yoksa o
  // siparişin fulfillment'ı bozulur (prepareFulfillmentData service_zone'u option'dan
  // okur). Önce siparişlerin kullandığı option id'lerini topla.
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

  // Eski starter + mevcut Aras option'larını temizle (yeniden kurulabilsin) —
  // ama yalnızca hiçbir siparişin kullanmadıklarını.
  const removeNames = [...STARTER_OPTION_NAMES, ...ARAS_OPTION_NAMES]
  const removeIds = existingOptions
    .filter(
      (o: any) =>
        removeNames.includes(o.name) && !referencedOptionIds.has(o.id)
    )
    .map((o: any) => o.id)
  if (removeIds.length) {
    try {
      await deleteShippingOptionsWorkflow(container).run({
        input: { ids: removeIds },
      })
      logger.info(
        `[setup-cargo] ${removeIds.length} kullanılmayan kargo seçeneği silindi (yeniden kurulacak).`
      )
    } catch (e: any) {
      logger.warn(
        `[setup-cargo] Seçenekler silinemedi (atlanıyor): ${e?.message}`
      )
    }
  }
  const keptReferenced = existingOptions.filter(
    (o: any) => removeNames.includes(o.name) && referencedOptionIds.has(o.id)
  )
  if (keptReferenced.length) {
    logger.info(
      `[setup-cargo] ${keptReferenced.length} option siparişlerce kullanıldığı için korundu: ${keptReferenced
        .map((o: any) => o.name)
        .join(", ")}`
    )
  }

  // Silinmeyen (korunan) Aras option'ları "mevcut" sayılır; duplicate üretme.
  const existingNames = new Set<string>(
    keptReferenced
      .filter((o: any) => ARAS_OPTION_NAMES.includes(o.name))
      .map((o: any) => o.name as string)
  )

  // --- 4. Aras seçeneklerini kur (yoksa) ---------------------------------
  const baseRules = [
    { attribute: "enabled_in_store", value: "true", operator: "eq" },
    { attribute: "is_return", value: "false", operator: "eq" },
  ]

  const optionsToCreate: any[] = []

  if (!existingNames.has("Aras Kargo - Standart")) {
    optionsToCreate.push({
      name: "Aras Kargo - Standart",
      price_type: "flat",
      provider_id: ARAS_PROVIDER_ID,
      service_zone_id: turkeyZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Standart",
        description: "Aras Kargo ile 2-3 iş günü içinde teslimat.",
        code: "standard",
      },
      prices: [{ currency_code: "try", amount: 50 * MINOR }],
      rules: baseRules,
    })
  }

  if (!existingNames.has("Aras Kargo - Hızlı")) {
    optionsToCreate.push({
      name: "Aras Kargo - Hızlı",
      price_type: "flat",
      provider_id: ARAS_PROVIDER_ID,
      service_zone_id: turkeyZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Hızlı",
        description: "Aras Kargo ile ertesi gün teslimat.",
        code: "express",
      },
      prices: [{ currency_code: "try", amount: 100 * MINOR }],
      rules: baseRules,
    })
  }

  if (!existingNames.has("Ücretsiz Kargo")) {
    optionsToCreate.push({
      name: "Ücretsiz Kargo",
      price_type: "flat",
      provider_id: ARAS_PROVIDER_ID,
      service_zone_id: turkeyZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Ücretsiz",
        description: `${freeShippingThreshold}₺ ve üzeri siparişlerde ücretsiz Aras Kargo.`,
        code: "free",
      },
      prices: [{ currency_code: "try", amount: 0 }],
      // Sepet ara toplamı eşiği aşınca görünür.
      rules: [
        ...baseRules,
        {
          attribute: "item_total",
          // Eşik minor unit'e çevrilir (item_total kuruş cinsinden) ve ondalıklı
          // verilir — Medusa kural motorunun Date.parse footgun'undan kaçınmak için
          // (tam sayı string'leri yanlışlıkla tarih sanılıyor).
          value: (freeShippingThreshold * MINOR).toFixed(2),
          operator: "gte",
        },
      ],
    })
  }

  if (optionsToCreate.length) {
    await createShippingOptionsWorkflow(container).run({
      input: optionsToCreate,
    })
    logger.info(
      `[setup-cargo] ${optionsToCreate.length} Aras kargo seçeneği oluşturuldu: ${optionsToCreate
        .map((o) => o.name)
        .join(", ")}`
    )
  } else {
    logger.info(
      "[setup-cargo] Tüm Aras kargo seçenekleri zaten mevcut (atlanıyor)."
    )
  }

  logger.info(
    `[setup-cargo] Tamamlandı. Ücretsiz kargo eşiği: ${freeShippingThreshold}₺. Beklenen seçenekler: ${ARAS_OPTION_NAMES.join(
      ", "
    )}`
  )
}
