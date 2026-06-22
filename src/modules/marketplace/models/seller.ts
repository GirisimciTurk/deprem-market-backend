import { model } from "@medusajs/framework/utils"
import SellerAdmin from "./seller-admin"
import SellerOrder from "./seller-order"
import SellerReturn from "./seller-return"
import SellerReview from "./seller-review"
import ProductQuestion from "./product-question"
import Conversation from "./conversation"
import SellerCampaign from "./seller-campaign"
import SellerAuditLog from "./seller-audit-log"

/**
 * Satıcı (bayi) — pazar yerinde ürün satan iş ortağı.
 * status: pending (başvuru/onay bekliyor) → active (satış yapabilir) → suspended (askıya alındı).
 * is_house: birinci-parti "Deprem Market" satıcısı (komisyonsuz, mevcut ürünlerin sahibi).
 */
const Seller = model.define("seller", {
  id: model.id().primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  legal_name: model.text().nullable(),
  email: model.text().nullable(),
  phone: model.text().nullable(),
  logo: model.text().nullable(),
  description: model.text().nullable(),
  status: model.enum(["pending", "active", "suspended"]).default("pending").index(),
  // Komisyon yüzdesi (ör. 10 = %10). Kategori bazlı override sonraki fazda.
  commission_rate: model.number().default(10),
  tax_number: model.text().nullable(),
  iban: model.text().nullable(),
  // Payout için banka hesap sahibi adı
  account_holder: model.text().nullable(),
  is_house: model.boolean().default(false),
  // Satıcının tercih ettiği varsayılan kargo firması (cargo.ts CarrierCode):
  // aras | yurtici | mng | ptt. Kargolarken ön-seçili gelir.
  default_carrier: model.text().nullable(),
  // Satıcının MÜŞTERİYE yansıyan ücretsiz kargo kuralı (TRY major). Müşteri
  // kargosu normalde desi-bazlı hesaplanır; bu alan onu sıfırlayabilir:
  //   null  → ücretli (desi-bazlı müşteri kargosu alınır)
  //   0     → her zaman ücretsiz
  //   > 0   → bu satıcının sepetteki ara toplamı bu tutara ≥ ise ücretsiz
  // Not: yalnız MÜŞTERİ kargosunu etkiler; satıcı payout'undan düşülen gerçek
  // desi maliyeti (split-order cargo_fee) bundan bağımsızdır.
  free_shipping_threshold: model.number().nullable(),
  // Onaylı müşteri değerlendirmelerinin puan TOPLAMI ve sayısı (ikisi de tam
  // sayı; ortalama = rating_sum / rating_count, ondalık olarak okunurken
  // hesaplanır — model.number() integer olduğu için avg'i burada tutamayız).
  // SellerReview onay/spam durumu değişince recomputeSellerRating ile güncellenir.
  rating_sum: model.number().default(0),
  rating_count: model.number().default(0),
  admins: model.hasMany(() => SellerAdmin, { mappedBy: "seller" }),
  orders: model.hasMany(() => SellerOrder, { mappedBy: "seller" }),
  returns: model.hasMany(() => SellerReturn, { mappedBy: "seller" }),
  reviews: model.hasMany(() => SellerReview, { mappedBy: "seller" }),
  questions: model.hasMany(() => ProductQuestion, { mappedBy: "seller" }),
  conversations: model.hasMany(() => Conversation, { mappedBy: "seller" }),
  campaigns: model.hasMany(() => SellerCampaign, { mappedBy: "seller" }),
  audit_logs: model.hasMany(() => SellerAuditLog, { mappedBy: "seller" }),
})

export default Seller
