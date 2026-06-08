import { MedusaService } from "@medusajs/framework/utils"
import StorefrontSetting from "./models/setting"

class StorefrontSettingsModuleService extends MedusaService({
  StorefrontSetting,
}) {}

export default StorefrontSettingsModuleService
