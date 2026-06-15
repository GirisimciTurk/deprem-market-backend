import HavarModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const HAVAR_MODULE = "havar"

export default Module(HAVAR_MODULE, {
  service: HavarModuleService,
})
