import { MedusaService } from "@medusajs/framework/utils"
import ExpertLead from "./models/expert-lead"

class ExpertLeadModuleService extends MedusaService({
  ExpertLead,
}) {}

export default ExpertLeadModuleService
