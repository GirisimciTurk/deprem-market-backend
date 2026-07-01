import { model } from "@medusajs/framework/utils"

/**
 * Bayilik başvurusu — storefront formundan gelir, admin panelden değerlendirilir.
 * `pending` → admin `approved`/`rejected`/`suspended` yapar. Durum değişiminde
 * başvuru sahibine sonuç e-postası gönderilir (lib/reseller-mail.ts).
 */
const ResellerApplication = model.define("reseller_application", {
  id: model.id().primaryKey(),
  // Başvuru türü: "bayi" (ürün satan bayilik) veya "firma" (kurumsal iş ortaklığı,
  // /firma-ol). Admin panelinde ayrıştırma/filtreleme için kullanılır.
  application_type: model.enum(["bayi", "firma"]).default("bayi").index(),
  company_name: model.text(),
  applicant_name: model.text().default(""),
  email: model.text().index(),
  phone: model.text().default(""),
  city: model.text().default(""),
  tax_number: model.text().default(""),
  message: model.text().default(""),
  status: model.enum(["pending", "approved", "rejected", "suspended"]).default("pending").index(),
  // Durum "rejected" yapıldığı an damgalanır; saatlik temizlik işi 24 saat
  // sonra başvuruyu otomatik siler. Durum red dışına alınırsa null'lanır
  // (silme zamanlayıcısı iptal). Bkz. src/jobs/purge-rejected-applications.ts
  rejected_at: model.dateTime().nullable(),
})

export default ResellerApplication
