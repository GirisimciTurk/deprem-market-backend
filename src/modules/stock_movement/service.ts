import { MedusaService } from "@medusajs/framework/utils"
import StockMovement from "./models/stock-movement"

class StockMovementModuleService extends MedusaService({
  StockMovement,
}) {}

export default StockMovementModuleService
