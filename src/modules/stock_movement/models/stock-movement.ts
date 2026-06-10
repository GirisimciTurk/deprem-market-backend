import { model } from "@medusajs/framework/utils"

/**
 * Stok hareket / denetim kaydı. Her stok değişikliği (satış, iade, manuel düzeltme,
 * lokasyonlar arası transfer, sayım mutabakatı, ilk kurulum) için bir satır yazılır.
 * Salt-ekleme (append-only) bir defter: kayıtlar güncellenmez/silinmez.
 */
const StockMovement = model.define("stock_movement", {
  id: model.id().primaryKey(),
  inventory_item_id: model.text().index(),
  location_id: model.text().index(),
  // Görüntülemeyi join'siz yapmak için denormalize alanlar.
  sku: model.text().nullable(),
  product_title: model.text().nullable(),
  location_name: model.text().nullable(),
  // Hareket türü.
  type: model
    .enum([
      "sale", // satış (sipariş) → stok düşer
      "return", // iade teslim alındı → stok artar
      "manual", // admin manuel düzeltme
      "transfer_in", // transferle gelen
      "transfer_out", // transferle giden
      "count", // sayım mutabakatı düzeltmesi
      "initial", // ilk kurulum/seed
    ])
    .index(),
  // Stok değişimi (+artış / −azalış).
  quantity_delta: model.number(),
  // Hareket sonrası stoklanan miktar (biliniyorsa).
  resulting_quantity: model.number().nullable(),
  // Serbest metin sebep/not.
  reason: model.text().nullable(),
  // İlişkili kaynak (order_id, return_id, transfer grup id'si vb.).
  reference_id: model.text().nullable(),
  // İşlemi yapan admin (e-posta veya id).
  actor: model.text().nullable(),
})

export default StockMovement
