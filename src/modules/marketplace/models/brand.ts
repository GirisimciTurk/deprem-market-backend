import { model } from "@medusajs/framework/utils"

/**
 * Marka — platform genelinde yönetilen onaylı marka listesi (Trendyol marka
 * mantığı). Satıcı ürün eklerken serbest metin yerine onaylı listeden seçer;
 * listede yoksa yeni marka TALEP eder (status="pending") → admin onaylar.
 *
 * Ürüne bağ: ürünün `subtitle`'ı marka adı (gösterim/geri uyumluluk) +
 * `metadata.brand_id` marka kimliği olarak tutulur.
 */
const Brand = model.define("brand", {
  id: model.id().primaryKey(),
  name: model.text(),
  // URL/eşleştirme için tekil slug.
  slug: model.text().unique(),
  // "approved" = satıcılar seçebilir; "pending" = admin onayı bekliyor.
  status: model.enum(["approved", "pending"]).default("pending"),
  // Opsiyonel marka logosu URL'i.
  logo: model.text().nullable(),
  // Markayı talep eden satıcı (pending talepte iz). Onaylanınca anlamını yitirir.
  requested_by_seller_id: model.text().nullable(),
})

export default Brand
