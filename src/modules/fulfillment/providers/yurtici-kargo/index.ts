import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import YurticiKargoFulfillmentProviderService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [YurticiKargoFulfillmentProviderService],
})
