import { model } from "@medusajs/framework/utils"

/**
 * Özel hizmet talebi / proje kaydı.
 *
 * Normal e-ticaretten farklı: müşteri "sepete at" yerine bir hizmet ürünü için
 * (karbon fiber güçlendirme, panik odası, iniş aparatı, kapsül yatak, gaz/elektrik
 * kesici...) KEŞİF talebi açar. Akış bir durum makinesidir:
 *
 *   talep → kesif_planlandi → kesif_yapildi → teklif_gonderildi → onaylandi
 *         → tedarik → teslim_edildi → montaj_planlandi → montaj_yapildi → tamamlandi
 *   (her an: reddedildi / iptal)
 *
 * Keşif gerektirmeyen hafif ürünlerde (gaz kesici vb.) keşif aşamaları atlanıp
 * doğrudan montaj randevusuna geçilebilir (requires_survey=false).
 *
 * Ürüne özgü ölçü/alanlar `details` JSON'unda; teklif kalemleri `offer_items`'ta.
 * Keşif + montajı yapan BAYİ marketplace `seller`'ıdır (assigned_seller_id).
 */
const ServiceRequest = model.define("service_request", {
  id: model.id().primaryKey(),

  // ───── Hangi hizmet ─────
  product_id: model.text().index().nullable(), // vitrindeki Medusa ürünü (varsa)
  service_title: model.text().default(""), // okunabilir başlık
  service_kind: model
    .enum([
      "carbon_fiber", // karbon fiber kolon güçlendirme
      "panic_room", // panik odası
      "descent", // yüksek kat iniş aparatı
      "capsule_bed", // kapsüle dönüşen yatak kiti
      "gas_cutoff", // otomatik gaz/elektrik kesici
      "other",
    ])
    .default("other")
    .index(),
  requires_survey: model.boolean().default(true),

  // ───── Müşteri ─────
  customer_id: model.text().index().nullable(), // giriş yapmışsa
  full_name: model.text(),
  email: model.text().index(),
  phone: model.text().default(""),

  // ───── Adres / saha ─────
  city: model.text().default(""),
  district: model.text().default(""),
  address: model.text().default(""),
  details: model.json().nullable(), // kat sayısı, m², bina yaşı, hedef kat...
  preferred_dates: model.json().nullable(), // müşterinin tercih ettiği keşif tarihleri

  // ───── Bayi (keşif + montajı yapan) ─────
  assigned_seller_id: model.text().index().nullable(),
  // Otomatik atamada reddeden bayilerin id'leri (tekrar atanmasın diye).
  rejected_seller_ids: model.json().nullable(),

  // ───── Keşif ─────
  survey_scheduled_at: model.dateTime().nullable(),
  survey_done_at: model.dateTime().nullable(),
  survey_report: model.text().default(""),

  // ───── Teklif ─────
  offer_items: model.json().nullable(), // [{ label, qty, unit_price, total }]
  offer_total: model.number().nullable(), // TL
  offer_valid_until: model.dateTime().nullable(),
  offer_sent_at: model.dateTime().nullable(),
  offer_decision: model.enum(["pending", "accepted", "rejected"]).default("pending"),

  // ───── Ödeme aşamaları (escrow mantığı) ─────
  survey_fee: model.number().nullable(), // keşif ücreti (işe dönerse mahsup)
  deposit_amount: model.number().nullable(), // kapora
  balance_amount: model.number().nullable(), // bakiye
  payment_status: model
    .enum(["none", "survey_paid", "deposit_paid", "paid"])
    .default("none")
    .index(),

  // ───── Montaj ─────
  install_scheduled_at: model.dateTime().nullable(),
  install_done_at: model.dateTime().nullable(),

  // ───── Durum ─────
  status: model
    .enum([
      "talep",
      "kesif_planlandi",
      "kesif_yapildi",
      "teklif_gonderildi",
      "onaylandi",
      "reddedildi",
      "tedarik",
      "teslim_edildi",
      "montaj_planlandi",
      "montaj_yapildi",
      "tamamlandi",
      "iptal",
    ])
    .default("talep")
    .index(),

  note: model.text().default(""),
})

export default ServiceRequest
