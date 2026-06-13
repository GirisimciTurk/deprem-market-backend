import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Ürün sorusu (Trendyol "Soru & Cevap"). Müşteri ürün hakkında soru sorar; ürünün
 * satıcısı yanıtlar. Yanıtlanan + onaylı sorular ürün sayfasında herkese görünür.
 *
 * Akış: müşteri sorar → "pending" (satıcı yanıtını + moderasyonu bekler) →
 *        satıcı yanıtlar → "answered" (görünür) ; admin uygunsuzu "rejected" yapar.
 *
 * Ürün bilgisi denormalize (ürün silinse de liste çalışsın). seller_id = sorunun
 * yönlendirildiği satıcı (ürünün sahibi).
 */
const ProductQuestion = model.define("product_question", {
  id: model.id().primaryKey(),
  product_id: model.text().index(),
  product_handle: model.text().nullable(),
  product_title: model.text(),
  seller: model.belongsTo(() => Seller, { mappedBy: "questions" }),
  customer_id: model.text().index().nullable(),
  customer_name: model.text(),
  customer_email: model.text().nullable(),
  question: model.text(),
  answer: model.text().nullable(),
  status: model.enum(["pending", "answered", "rejected"]).default("pending").index(),
  answered_at: model.dateTime().nullable(),
})

export default ProductQuestion
