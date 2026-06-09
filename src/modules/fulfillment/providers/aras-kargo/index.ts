import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import ArasKargoFulfillmentProviderService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [ArasKargoFulfillmentProviderService],
})
