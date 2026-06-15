import { MedusaService } from "@medusajs/framework/utils"
import HavarRequest from "./models/havar-request"

class HavarModuleService extends MedusaService({
  HavarRequest,
}) {}

export default HavarModuleService
