import { model } from "@medusajs/framework/utils"

/**
 * Bülten (newsletter) abonesi. Anonim e-posta kaydı; tekil e-posta (unique).
 * `status` ile abonelikten çıkış işaretlenir (kayıt silinmez → geçmiş korunur).
 */
const NewsletterSubscriber = model.define("newsletter_subscriber", {
  id: model.id().primaryKey(),
  email: model.text().unique(),
  status: model.enum(["active", "unsubscribed"]).default("active").index(),
  // Kaydın alındığı yer (footer, checkout vb.) — opsiyonel raporlama için.
  source: model.text().nullable(),
})

export default NewsletterSubscriber
