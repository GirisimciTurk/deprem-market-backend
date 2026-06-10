import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createReturnReasonsWorkflow,
  createShippingOptionsWorkflow,
} from "@medusajs/core-flows"

// Müşterinin iade talebinde seçeceği başlangıç iade sebepleri (Türkçe).
const STARTER_REASONS = [
  {
    value: "hasarli",
    label: "Ürün hasarlı/kırık geldi",
    description: "Ürün kargoda hasar görmüş ya da kırık/arızalı teslim edildi.",
  },
  {
    value: "yanlis-urun",
    label: "Yanlış ürün gönderildi",
    description: "Sipariş ettiğim üründen farklı bir ürün geldi.",
  },
  {
    value: "eksik-parca",
    label: "Eksik parça/ürün",
    description: "Siparişin bir kısmı veya ürünün bir parçası eksik geldi.",
  },
  {
    value: "begenmedim",
    label: "Beğenmedim/vazgeçtim",
    description: "Ürün beklentimi karşılamadı ya da fikrim değişti.",
  },
  {
    value: "yanlis-beden-ozellik",
    label: "Yanlış özellik/beden",
    description: "Ürünün özelliği, boyutu veya bedeni uygun değil.",
  },
  {
    value: "diger",
    label: "Diğer",
    description: "Yukarıdakilerin dışında bir sebep.",
  },
]

// Müşteri iade talebi (`POST /store/returns`) bir iade kargo seçeneği (return_shipping)
// ZORUNLU ister. Bunu manuel Aras provider'ı ile, ücretsiz (0₺) ve is_return=true kuralıyla kurarız.
const RETURN_OPTION_NAME = "Ücretsiz İade Kargosu"
const ARAS_PROVIDER_ID = "aras_kargo"

export default async function setupReturns({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModule = container.resolve(Modules.ORDER)

  // --- 1. İade sebepleri (idempotent) ------------------------------------
  const existingReasons = await orderModule.listReturnReasons({}, { take: 100 })
  const existingValues = new Set(existingReasons.map((r: { value: string }) => r.value))
  const reasonsToCreate = STARTER_REASONS.filter((r) => !existingValues.has(r.value))

  if (reasonsToCreate.length) {
    await createReturnReasonsWorkflow(container).run({ input: { data: reasonsToCreate } })
    logger.info(
      `[setup-returns] ${reasonsToCreate.length} iade sebebi oluşturuldu (toplam ${existingReasons.length + reasonsToCreate.length}).`
    )
  } else {
    logger.info(
      `[setup-returns] Tüm iade sebepleri zaten mevcut (${existingReasons.length} kayıt).`
    )
  }

  // --- 2. İade kargo seçeneği (idempotent) -------------------------------
  const { data: existingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })
  if (existingOptions.some((o: any) => o.name === RETURN_OPTION_NAME)) {
    logger.info(`[setup-returns] '${RETURN_OPTION_NAME}' zaten mevcut (atlanıyor).`)
    logger.info("[setup-returns] Tamamlandı.")
    return
  }

  const { data: serviceZones } = await query.graph({
    entity: "service_zone",
    fields: ["id", "name", "geo_zones.country_code"],
  })
  const turkeyZone =
    serviceZones.find((z: any) =>
      (z.geo_zones || []).some((g: any) => (g.country_code || "").toLowerCase() === "tr")
    ) || serviceZones.find((z: any) => /turk/i.test(z.name || ""))
  if (!turkeyZone) {
    logger.warn(
      "[setup-returns] Türkiye servis bölgesi bulunamadı; iade kargo seçeneği oluşturulamadı. Önce 'npm run setup:cargo' çalıştırın."
    )
    return
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "type"],
  })
  const shippingProfile =
    shippingProfiles.find((p: any) => p.type === "default") || shippingProfiles[0]
  if (!shippingProfile) {
    logger.warn("[setup-returns] Shipping profile bulunamadı; iade kargo seçeneği oluşturulamadı.")
    return
  }

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: RETURN_OPTION_NAME,
        price_type: "flat",
        provider_id: ARAS_PROVIDER_ID,
        service_zone_id: turkeyZone.id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "İade",
          description: "Ücretsiz iade kargosu ile ürünlerinizi geri gönderin.",
          code: "return",
        },
        prices: [{ currency_code: "try", amount: 0 }],
        // is_return=true → bu seçenek yalnızca iade akışında (store/returns) kullanılır,
        // checkout'ta görünmez.
        rules: [{ attribute: "is_return", value: "true", operator: "eq" }],
      },
    ],
  })
  logger.info(`[setup-returns] '${RETURN_OPTION_NAME}' iade kargo seçeneği oluşturuldu.`)
  logger.info("[setup-returns] Tamamlandı.")
}
