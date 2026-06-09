import ResellerModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const RESELLER_MODULE = "reseller"

export default Module(RESELLER_MODULE, {
  service: ResellerModuleService,
})
