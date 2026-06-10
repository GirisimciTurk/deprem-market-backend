import StockMovementModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const STOCK_MOVEMENT_MODULE = "stock_movement"

export default Module(STOCK_MOVEMENT_MODULE, {
  service: StockMovementModuleService,
})
