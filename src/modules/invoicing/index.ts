import { Module } from "@medusajs/framework/utils"
import InvoicingModuleService from "./service"

export const INVOICING_MODULE = "invoicing"

export default Module(INVOICING_MODULE, {
  service: InvoicingModuleService,
})
