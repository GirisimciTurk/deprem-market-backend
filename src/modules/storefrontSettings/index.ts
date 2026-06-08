import StorefrontSettingsModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const STOREFRONT_SETTINGS_MODULE = "storefrontSettings"

export default Module(STOREFRONT_SETTINGS_MODULE, {
  service: StorefrontSettingsModuleService,
})
