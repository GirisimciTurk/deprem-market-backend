import { model } from "@medusajs/framework/utils"
import SellerAdmin from "./seller-admin"
import SellerOrder from "./seller-order"
import SellerReturn from "./seller-return"

/**
 * Satıcı (bayi) — pazar yerinde ürün satan iş ortağı.
 * status: pending (başvuru/onay bekliyor) → active (satış yapabilir) → suspended (askıya alındı).
 * is_house: birinci-parti "Deprem Market" satıcısı (komisyonsuz, mevcut ürünlerin sahibi).
 */
const Seller = model.define("seller", {
  id: model.id().primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  legal_name: model.text().nullable(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  logo: model.text().nullable(),
  description: model.text().nullable(),
  status: model.enum(["pending", "active", "suspended"]).default("pending").index(),
  // Komisyon yüzdesi (ör. 10 = %10). Kategori bazlı override sonraki fazda.
  commission_rate: model.number().default(10),
  tax_number: model.text().nullable(),
  iban: model.text().nullable(),
  // Payout için banka hesap sahibi adı
  account_holder: model.text().nullable(),
  is_house: model.boolean().default(false),
  admins: model.hasMany(() => SellerAdmin, { mappedBy: "seller" }),
  orders: model.hasMany(() => SellerOrder, { mappedBy: "seller" }),
  returns: model.hasMany(() => SellerReturn, { mappedBy: "seller" }),
})

export default Seller
