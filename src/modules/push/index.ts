import PushModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const PUSH_MODULE = "push"

export default Module(PUSH_MODULE, {
  service: PushModuleService,
})
