import { MedusaContainer } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

export default async function addPaynkolayProvider({ container }: { container: MedusaContainer }) {
  const regionModuleService = container.resolve(Modules.REGION)
  const logger = container.resolve("logger")

  logger.info("Retrieving all regions...")
  const regions = await regionModuleService.listRegions({})

  for (const region of regions) {
    logger.info(`Checking region ${region.name}...`)
    const providers = region.payment_providers || []
    
    const hasPaynkolay = providers.some((p: any) => {
      const id = typeof p === "string" ? p : p.id
      return id === "pp_paynkolay_paynkolay"
    })
    
    if (!hasPaynkolay) {
      logger.info(`Adding pp_paynkolay_paynkolay to region ${region.name}...`)
      const existingProviderIds = providers.map((p: any) => typeof p === "string" ? p : p.id)
      await (regionModuleService as any).updateRegions([
        {
          id: region.id,
          payment_providers: [...existingProviderIds, "pp_paynkolay_paynkolay"]
        }
      ])
      logger.info(`Successfully updated region ${region.name}.`)
    } else {
      logger.info(`Region ${region.name} already has pp_paynkolay_paynkolay.`)
    }
  }
}
