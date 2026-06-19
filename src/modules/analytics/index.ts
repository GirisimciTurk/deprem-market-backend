import AnalyticsModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const ANALYTICS_MODULE = "analytics"

export default Module(ANALYTICS_MODULE, {
  service: AnalyticsModuleService,
})
