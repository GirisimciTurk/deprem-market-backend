import { model } from "@medusajs/framework/utils"

/**
 * Kategori bazlı dinamik ürün özelliği (Trendyol "kategori özellikleri" mantığı).
 * Admin bir kategoriye özellik tanımlar (ör. Giyim → Renk[select], Beden[select],
 * Cinsiyet[select]); satıcı o kategoride ürün eklerken bu alanlar dinamik olarak
 * forma gelir. Değerler ürünün `metadata.attributes` ({ key: value }) alanında tutulur.
 *
 * Özellikler kategori ağacında MİRAS alınır: bir kategori seçilince hem kendi hem
 * üst kategorilerinin özellikleri gösterilir (resolve-category-attributes.ts).
 */
const CategoryAttribute = model.define("category_attribute", {
  id: model.id().primaryKey(),
  // İlişkilendiği product_category.id (native Medusa kategori).
  category_id: model.text().index(),
  // Makine adı (snake_case, metadata.attributes anahtarı). Ör. "renk".
  key: model.text(),
  // Görünen etiket. Ör. "Renk".
  name: model.text(),
  // Alan tipi: serbest metin / sayı / tek seçim / çoklu seçim / evet-hayır.
  type: model.enum(["text", "number", "select", "multiselect", "boolean"]).default("text"),
  // select/multiselect için seçenek listesi (string[]). Diğer tiplerde null.
  options: model.json().nullable(),
  // number tipinde birim etiketi (ör. "cm", "L", "W"). Opsiyonel.
  unit: model.text().nullable(),
  // Zorunlu mu? Zorunlu özellik boşsa ürün onaya gönderilemez.
  required: model.boolean().default(false),
  // Sıralama (form ve listede). Küçük önce.
  rank: model.number().default(0),
})

export default CategoryAttribute
