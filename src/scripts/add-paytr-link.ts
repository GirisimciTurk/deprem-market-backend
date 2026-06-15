import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * PayTR ödeme sağlayıcısını tüm bölgelere bağlar (region_payment_provider).
 * Çalıştır: npx medusa exec ./src/scripts/add-paytr-link.ts
 */
export default async function addPaytrLink({ container }: { container: MedusaContainer }) {
  const regionModuleService = container.resolve(Modules.REGION)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve("logger")

  const regions = await regionModuleService.listRegions({})
  for (const region of regions) {
    const { data: existing } = await query.graph({
      entity: "region_payment_provider",
      fields: ["region_id", "payment_provider_id"],
      filters: { region_id: region.id, payment_provider_id: "pp_paytr_paytr" },
    })
    if (!existing || existing.length === 0) {
      await link.create([
        {
          [Modules.REGION]: { region_id: region.id },
          [Modules.PAYMENT]: { payment_provider_id: "pp_paytr_paytr" },
        },
      ])
      logger.info(`PayTR → ${region.name} (${region.id}) bağlandı.`)
    } else {
      logger.info(`PayTR zaten bağlı: ${region.name}.`)
    }
  }
}
