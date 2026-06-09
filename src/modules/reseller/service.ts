import { MedusaService } from "@medusajs/framework/utils"
import ResellerApplication from "./models/reseller-application"

class ResellerModuleService extends MedusaService({
  ResellerApplication,
}) {}

export default ResellerModuleService
