import ExpertLeadModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const EXPERT_LEAD_MODULE = "expert_lead"

export default Module(EXPERT_LEAD_MODULE, {
  service: ExpertLeadModuleService,
})
