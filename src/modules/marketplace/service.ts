import { MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import SellerOrder from "./models/seller-order"
import SellerReturn from "./models/seller-return"

// Otomatik CRUD: createSellers/... + createSellerOrders/... + createSellerReturns/...
class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerAdmin,
  SellerOrder,
  SellerReturn,
}) {}

export default MarketplaceModuleService
