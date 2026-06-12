import { model } from "@medusajs/framework/utils"

/**
 * Kategori bazlı komisyon oranı (platform geneli). Bir ürünün komisyonu, ürünün
 * kategorisine ait kural varsa o orandan; yoksa satıcının sabit commission_rate'inden
 * hesaplanır (house satıcı = %0). Trendyol'daki kategori-bazlı komisyon mantığı.
 */
const CommissionRule = model.define("commission_rule", {
  id: model.id().primaryKey(),
  category_id: model.text().unique(),
  category_name: model.text().nullable(),
  rate: model.number().default(10), // yüzde
})

export default CommissionRule
