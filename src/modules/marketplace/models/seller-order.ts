import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Satıcı alt-siparişi — bir müşteri siparişinin tek bir satıcıya düşen parçası.
 * Çok-satıcılı sepette sipariş, order.placed anında satıcı bazında bölünür ve
 * her satıcı için bir seller_order üretilir. Komisyon burada anlık (snapshot)
 * hesaplanır; payout (satıcıya ödeme) bu kayıt üzerinden manuel işaretlenir.
 *
 * Tutarlar minor unit (kuruş) cinsindendir — Medusa order item unit_price ile aynı.
 */
const SellerOrder = model.define("seller_order", {
  id: model.id().primaryKey(),
  seller: model.belongsTo(() => Seller, { mappedBy: "orders" }),
  // Ana Medusa siparişi (referans; ayrı modülde olduğu için link değil text).
  order_id: model.text().index(),
  display_id: model.text().nullable(),
  customer_email: model.text().nullable(),
  currency_code: model.text().default("try"),
  // Bu satıcıya düşen kalemlerin ara toplamı (kuruş).
  subtotal: model.number().default(0),
  commission_rate: model.number().default(0),
  commission_amount: model.number().default(0),
  // Satıcının net kazancı = subtotal - commission_amount.
  seller_earning: model.number().default(0),
  item_count: model.number().default(0),
  // İade agregaları (order.return_received ile güncellenir). Net ödenecek =
  // seller_earning - returned_earning.
  returned_subtotal: model.number().default(0),
  returned_commission: model.number().default(0),
  returned_earning: model.number().default(0),
  // Kalem anlık görüntüsü: [{ product_id, title, variant_title, quantity, unit_price, line_total, thumbnail }]
  items: model.json().nullable(),
  // Satıcının kargolayabilmesi için teslim adresi anlık görüntüsü.
  shipping_address: model.json().nullable(),
  fulfillment_status: model.enum(["pending", "fulfilled", "canceled"]).default("pending").index(),
  payout_status: model.enum(["pending", "paid"]).default("pending").index(),
  paid_at: model.dateTime().nullable(),
  fulfilled_at: model.dateTime().nullable(),
  note: model.text().nullable(),
})

export default SellerOrder
