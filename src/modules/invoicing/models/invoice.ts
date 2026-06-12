import { model } from "@medusajs/framework/utils"

/**
 * Fatura (e-fatura/e-arşiv taslağı).
 *  - type "sale": satıcı → müşteri (ürün satış faturası, her seller_order için)
 *  - type "commission": platform → satıcı (komisyon faturası)
 * status: draft (entegratör yok/henüz gönderilmedi) → sent (entegratöre iletildi)
 *         → error (gönderim hatası).
 *
 * Tutarlar minor unit (kuruş). Entegratör bağımsızdır; gönderim
 * lib/einvoice/providers üzerinden yapılır (şu an fail-closed draft).
 */
const Invoice = model.define("invoice", {
  id: model.id().primaryKey(),
  type: model.enum(["sale", "commission"]).index(),
  status: model.enum(["draft", "sent", "error"]).default("draft").index(),

  // Dahili taslak numarası (her zaman); entegratör resmi numarayı sonra doldurur.
  draft_number: model.text(),
  invoice_number: model.text().nullable(),
  issue_date: model.dateTime(),

  // Taraflar (anlık görüntü — fatura zamanındaki bilgiler).
  issuer_name: model.text(),
  issuer_tax_number: model.text().nullable(),
  recipient_name: model.text(),
  recipient_tax_number: model.text().nullable(), // TC kimlik veya VKN
  recipient_email: model.text().nullable(),
  recipient_address: model.json().nullable(),

  // Referanslar.
  order_id: model.text().index(),
  display_id: model.text().nullable(),
  seller_order_id: model.text().nullable(),
  seller_id: model.text().index().nullable(),

  // Tutarlar (kuruş).
  currency_code: model.text().default("try"),
  net_total: model.number().default(0), // KDV hariç
  tax_total: model.number().default(0), // KDV
  grand_total: model.number().default(0), // KDV dahil
  tax_rate: model.number().default(20),

  // Kalemler + UBL-TR taslak yapısı.
  lines: model.json().nullable(),
  ubl_payload: model.json().nullable(),

  // Entegratör.
  provider: model.text().nullable(),
  external_id: model.text().nullable(),
  sent_at: model.dateTime().nullable(),
  error_message: model.text().nullable(),
})

export default Invoice
