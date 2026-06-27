import { model } from "@medusajs/framework/utils"

/**
 * Halkın bir uzman/uygulayıcı profilinde bıraktığı HİZMET TALEBİ ("Talep Bırak").
 * Yarı-aktif lead: sağlayıcı iletişim bilgisini gizlese bile, ziyaretçi talebini
 * bırakır; sağlayıcıya e-posta ile iletilir (sağlayıcının telefonu ziyaretçiye
 * AÇILMADAN). Admin de görür/takip eder.
 *
 * `new` → admin/sağlayıcı `forwarded` (iletildi) / `closed` (kapandı) yapar.
 */
const ExpertRequest = model.define("expert_request", {
  id: model.id().primaryKey(),
  // Hedef profil (expert_lead) referansı + e-posta/listeleme için snapshot.
  expert_id: model.text().index(),
  expert_slug: model.text().default(""),
  expert_name: model.text().default(""),
  // Talebi bırakan ziyaretçi.
  customer_name: model.text(),
  customer_phone: model.text().default(""),
  customer_email: model.text().default(""),
  city: model.text().default(""),
  topic: model.text().default(""), // ihtiyaç başlığı (uzmanlık anahtarı veya serbest)
  message: model.text().default(""),
  status: model.enum(["new", "forwarded", "closed"]).default("new").index(),
})

export default ExpertRequest
