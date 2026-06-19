import { MedusaService } from "@medusajs/framework/utils"
import AnalyticsEvent from "./models/event"

class AnalyticsModuleService extends MedusaService({
  AnalyticsEvent,
}) {}

export default AnalyticsModuleService
