import { model } from "@medusajs/framework/utils"

/**
 * Uzman (inşaat mühendisi) ön-kayıt / ilgi kaydı — storefront /uzman-ol formundan gelir,
 * admin panelden değerlendirilir. Discovery-first MVP: amaç talebi ölçmek + erken kayıt
 * listesi oluşturmak. İleride doğrulanmış "Uzman Dizini" profiline dönüşecek.
 *
 * `new` → admin `contacted` (iletişime geçildi) / `approved` (dizine alınacak) /
 * `archived` (ilgilenilmeyecek) yapar.
 */
const ExpertLead = model.define("expert_lead", {
  id: model.id().primaryKey(),
  // Rol: engineer = İnşaat Mühendisi (tespit/proje/danışmanlık),
  //      implementer = Uygulayıcı/Yüklenici (inşaat & güçlendirme fiziki uygulama).
  provider_type: model.enum(["engineer", "implementer"]).default("engineer").index(),
  full_name: model.text(),
  title: model.text().default(""), // Unvan: İnşaat Müh. / Yüksek İnşaat Müh. / Usta / Firma yetkilisi
  email: model.text().index(),
  phone: model.text().default(""),
  city: model.text().default(""), // Ana il
  district: model.text().default(""), // Ana ilçe
  // Uzmanlık anahtarları (EXPERT_SPECIALIZATIONS) — sabit listeden çoklu seçim.
  specializations: model.json(),
  experience_years: model.number().nullable(),
  imo_member: model.boolean().default(false), // İMO (oda) üyesi mi
  service_areas: model.text().default(""), // Ek hizmet bölgeleri (serbest metin, opsiyonel)
  // Discovery sinyali: "aylık ne kadar öderdin?" (EXPERT_BUDGET_TIERS anahtarı)
  budget_tier: model.text().default(""),
  // Asıl "fikir/beklenti" alanı — platformdan ne bekliyor, neye ihtiyacı var.
  message: model.text().default(""),
  status: model.enum(["new", "contacted", "approved", "archived"]).default("new").index(),
  notes: model.text().default(""), // Admin iç notu

  // --- Faz 1 dizin profili alanları -------------------------------------
  slug: model.text().nullable(), // /uzmanlar/[slug] — oluşturmada üretilir
  about: model.text().default(""), // Hakkında / kısa biyografi
  photo_url: model.text().default(""), // Profil fotoğrafı
  // Belgeler: [{ type: "diploma"|"oda"|"lisans"|"diger", url, name }]
  documents: model.json().nullable(),
  // İletişim tercihleri (pasif dizin) — sağlayıcı hangi kanalı göstereceğini seçer.
  whatsapp: model.text().default(""),
  show_phone: model.boolean().default(true),
  show_email: model.boolean().default(false),
  // Yayın: admin doğrulayıp yayınlayınca /uzmanlar'da görünür (status=approved + is_published).
  is_published: model.boolean().default(false).index(),
  published_at: model.dateTime().nullable(),
  // Üyelik paketi (komisyon/escrow YOK, üyelik temelli iş modeli): none = ücretsiz/temel
  // liste, basic = Temel paket, premium = Üst paket (dizinde öne çıkar + rozet).
  // Beta'da ödeme yok; admin manuel atar.
  membership_tier: model.enum(["none", "basic", "premium"]).default("none").index(),
})

export default ExpertLead
