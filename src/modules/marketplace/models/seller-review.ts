import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Müşterinin bir satıcıya verdiği puan + yorum (Trendyol "Satıcı Puanı").
 * Ürün yorumlarına (product_review) paralel akış: yeni değerlendirme `pending`
 * başlar, admin "Yayınla" deyince `approved` olur ve mağaza vitrininde görünür.
 * `spam` gizler (silmeden). Satıcının ortalama puanı (seller.rating_avg/count)
 * yalnız `approved` kayıtlardan türetilir.
 */
const SellerReview = model.define("seller_review", {
  id: model.id().primaryKey(),
  seller: model.belongsTo(() => Seller, { mappedBy: "reviews" }),
  // İsteğe bağlı: hangi siparişten geldiği (doğrulanmış alışveriş işareti için).
  order_id: model.text().index().nullable(),
  customer_id: model.text().index().nullable(),
  customer_name: model.text(),
  rating: model.number(),
  comment: model.text(),
  status: model.enum(["pending", "approved", "spam"]).default("pending").index(),
})

export default SellerReview
