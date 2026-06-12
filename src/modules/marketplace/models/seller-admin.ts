import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Satıcı kullanıcısı — satıcı panelinde oturum açan kişi. Auth identity ile
 * (actor_type "seller") setAuthAppMetadataStep üzerinden eşlenir.
 */
const SellerAdmin = model.define("seller_admin", {
  id: model.id().primaryKey(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  email: model.text().unique(),
  phone: model.text().nullable(),
  seller: model.belongsTo(() => Seller, { mappedBy: "admins" }),
})

export default SellerAdmin
