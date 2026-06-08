import { MedusaContainer } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

export default async function printRegions({ container }: { container: MedusaContainer }) {
  const regionModuleService = container.resolve(Modules.REGION)
  const logger = container.resolve("logger")

  logger.info("Retrieving all regions...")
  const regions = await regionModuleService.listRegions({})

  logger.info("Found regions:")
  for (const region of regions) {
    logger.info(`- Region: ${region.name} (${region.id})`)
    logger.info(`  Currency: ${region.currency_code}`)
  }
}
