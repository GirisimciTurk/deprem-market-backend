import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Satıcı iadesi — bir müşteri iadesinin tek bir satıcıya düşen parçası.
 * order.return_requested anında "requested" oluşur (satıcı görsün). Satıcı kendi
 * native return'ünü teslim alıp ONAYLAYINCA "received" olur, komisyon/kazanç geri
 * alınır (ilgili seller_order'ın returned_* agregaları güncellenir → payout net
 * düşer) ve müşteriye otomatik para iadesi yapılır. Satıcı REDDEDERSE "rejected"
 * olur (stok/clawback/iade YOK); admin hakem olarak satıcı adına kabul edebilir.
 *
 * Trendyol modeli: fiziksel teslim-al + kabul/ret = satıcı; para iadesi + hakem = platform.
 * Tutarlar minor unit (kuruş).
 */
const SellerReturn = model.define("seller_return", {
  id: model.id().primaryKey(),
  seller: model.belongsTo(() => Seller, { mappedBy: "returns" }),
  // Native Medusa return + order referansları (ayrı modülde olduğu için text).
  return_id: model.text().index(),
  order_id: model.text().index(),
  seller_order_id: model.text().nullable(),
  display_id: model.text().nullable(),
  customer_email: model.text().nullable(),
  currency_code: model.text().default("try"),
  status: model.enum(["requested", "received", "rejected"]).default("requested").index(),
  reason: model.text().nullable(),
  // Satıcının ret gerekçesi (status="rejected" iken).
  reject_reason: model.text().nullable(),
  // İade edilen kalem anlık görüntüsü: [{ product_id, title, quantity, unit_price, line_total }]
  items: model.json().nullable(),
  returned_subtotal: model.number().default(0),
  returned_commission: model.number().default(0),
  returned_earning: model.number().default(0),
  received_at: model.dateTime().nullable(),
  rejected_at: model.dateTime().nullable(),
})

export default SellerReturn
