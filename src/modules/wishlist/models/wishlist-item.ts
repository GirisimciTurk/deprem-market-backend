import { model } from "@medusajs/framework/utils"

/**
 * Müşterinin favori (wishlist) kaydı — storefront'taki kalp ikonu bunu yazar.
 *
 * Yalnız `customer_id` + `product_id` tutulur; ürün başlığı/fiyatı/görseli
 * BİLEREK kopyalanmaz. Favori listesi okunurken ürünler /store/products'tan
 * canlı çekilir, böylece fiyat/stok/görsel değişince liste bayatlamaz
 * (eski localStorage çözümünde snapshot tutuluyordu ve bayatlıyordu).
 *
 * (customer_id, product_id) çifti benzersiz: aynı ürün iki kez eklenemez.
 * Tekillik migration'da composite unique index ile zorlanır; servis katmanı da
 * eklemeden önce kontrol eder (yarış durumunda DB son sözü söyler).
 */
const WishlistItem = model
  .define("wishlist_item", {
    id: model.id().primaryKey(),
    customer_id: model.text().index(),
    product_id: model.text().index(),
  })
  .indexes([
    {
      name: "IDX_wishlist_item_customer_product_unique",
      on: ["customer_id", "product_id"],
      unique: true,
    },
  ])

export default WishlistItem
