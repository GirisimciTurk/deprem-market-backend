import { model } from "@medusajs/framework/utils"

/**
 * "Stoğa gelince haber ver" kaydı.
 *
 * Tükenen bir variant tekrar stoğa girdiğinde (stok 0 → pozitif) bu kayıtlardaki
 * `endpoint`'lere push gönderilir ve kayıt silinir. Aynı (variant_id, endpoint)
 * için tek kayıt tutulur (dedup service'te yapılır). Ürün bilgisi denormalize
 * saklanır ki bildirim mesajı ekstra sorgu olmadan kurulabilsin.
 */
const StockAlert = model.define("stock_alert", {
  id: model.id().primaryKey(),
  variant_id: model.text().index(),
  product_id: model.text().index().nullable(),
  product_handle: model.text().nullable(),
  product_title: model.text().nullable(),
  endpoint: model.text().index(),
  customer_id: model.text().nullable(),
})

export default StockAlert
