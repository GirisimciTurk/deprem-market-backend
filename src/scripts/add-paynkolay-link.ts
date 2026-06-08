import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function addPaynkolayLink({ container }: { container: MedusaContainer }) {
  const regionModuleService = container.resolve(Modules.REGION)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve("logger")

  logger.info("Retrieving all regions...")
  const regions = await regionModuleService.listRegions({})

  for (const region of regions) {
    logger.info(`Checking region ${region.name} (${region.id})...`)
    
    // Check if the link already exists
    const { data: existingLinks } = await query.graph({
      entity: "region_payment_provider",
      fields: ["region_id", "payment_provider_id"],
      filters: {
        region_id: region.id,
        payment_provider_id: "pp_paynkolay_paynkolay"
      }
    })

    if (!existingLinks || existingLinks.length === 0) {
      logger.info(`Creating link for region ${region.name} and pp_paynkolay_paynkolay...`)
      await link.create([
        {
          [Modules.REGION]: {
            region_id: region.id,
          },
          [Modules.PAYMENT]: {
            payment_provider_id: "pp_paynkolay_paynkolay",
          },
        }
      ])
      logger.info(`Successfully linked pp_paynkolay_paynkolay to region ${region.name}.`)
    } else {
      logger.info(`Region ${region.name} is already linked to pp_paynkolay_paynkolay.`)
    }
  }
}
