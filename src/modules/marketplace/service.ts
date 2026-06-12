import { MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import SellerOrder from "./models/seller-order"
import SellerReturn from "./models/seller-return"
import CommissionRule from "./models/commission-rule"

// Otomatik CRUD: createSellers/... + SellerOrders/SellerReturns/CommissionRules...
class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerAdmin,
  SellerOrder,
  SellerReturn,
  CommissionRule,
}) {}

export default MarketplaceModuleService
