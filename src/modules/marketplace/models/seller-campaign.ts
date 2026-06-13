import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Satıcı kampanyası (indirim). Bir satıcının KENDİ ürünlerine tanımladığı süreli
 * indirim. Arka planda bir Medusa **Price List (type=sale)** oluşturulur; bu
 * sayede storefront indirimli fiyatı + üstü çizili orijinali otomatik gösterir,
 * sepet/checkout indirimli fiyatı taşır ve komisyon GERÇEK satış fiyatından
 * hesaplanır (split-order anlık unit_price kullandığı için ek kod gerekmez).
 *
 * İndirim satıcının kendi marjından düşer (platform fonlamaz). Tutarlar kuruş.
 *
 * status: active (yürürlükte) | ended (satıcı/admin bitirdi → price list silindi).
 * Zamansal durum (scheduled/expired) starts_at/ends_at'tan TÜRETİLİR (campaignLiveStatus).
 */
const SellerCampaign = model.define("seller_campaign", {
  id: model.id().primaryKey(),
  seller: model.belongsTo(() => Seller, { mappedBy: "campaigns" }),
  // Arkadaki Medusa price list (ayrı modül → text referans).
  price_list_id: model.text().index(),
  name: model.text(),
  discount_type: model.enum(["percentage", "fixed"]).default("percentage"),
  // percentage: yüzde (ör. 20 = %20). fixed: ürün başına düşülen kuruş tutarı.
  discount_value: model.number().default(0),
  status: model.enum(["active", "ended"]).default("active").index(),
  starts_at: model.dateTime().nullable(),
  ends_at: model.dateTime().nullable(),
  // Hedeflenen ürünlerin anlık görüntüsü: [{ id, title }]
  product_ids: model.json().nullable(),
  // Kaç varyant fiyatı yazıldı (özet için).
  variant_count: model.number().default(0),
})

export default SellerCampaign
