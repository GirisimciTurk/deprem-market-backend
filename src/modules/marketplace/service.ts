import { MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import SellerOrder from "./models/seller-order"

// Otomatik CRUD: createSellers/retrieveSeller/listSellers/updateSellers...
// + createSellerAdmins/... + createSellerOrders/listSellerOrders/...
class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerAdmin,
  SellerOrder,
}) {}

export default MarketplaceModuleService
