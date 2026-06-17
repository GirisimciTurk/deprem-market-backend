import ServiceRequestModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const SERVICE_REQUEST_MODULE = "service_request"

export default Module(SERVICE_REQUEST_MODULE, {
  service: ServiceRequestModuleService,
})
