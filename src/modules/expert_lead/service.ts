import { MedusaService } from "@medusajs/framework/utils"
import ExpertLead from "./models/expert-lead"
import ExpertRequest from "./models/expert-request"

class ExpertLeadModuleService extends MedusaService({
  ExpertLead,
  ExpertRequest,
}) {}

export default ExpertLeadModuleService
