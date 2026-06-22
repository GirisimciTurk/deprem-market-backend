import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Sistem kaydı (audit log) — bir satıcı mağazasında YAPILAN her yazma işleminin
 * "kim, ne zaman, ne yaptı" kaydı. Satıcı panelindeki tüm mutasyon istekleri
 * (ürün ekle/güncelle, kupon, iade, kargolama, çalışan değişikliği...) izin/audit
 * middleware'i tarafından otomatik olarak buraya yazılır.
 *
 * Aktör bilgisi (admin id/ad/email) işlem anında kopyalanır (denormalize) ki
 * çalışan sonradan silinse bile kayıt okunabilir kalsın.
 */
const SellerAuditLog = model.define("seller_audit_log", {
  id: model.id().primaryKey(),
  // İşlemi yapan satıcı kullanıcısı (silinmiş olabilir → sadece id saklanır).
  actor_admin_id: model.text().index().nullable(),
  actor_name: model.text().nullable(),
  actor_email: model.text().nullable(),
  // Makine-okur aksiyon anahtarı (ör. "product.update", "campaign.create").
  action: model.text().index(),
  // İnsan-okur Türkçe özet (ör. "Ürünü güncelledi").
  summary: model.text(),
  // Etkilenen kayıt türü/kimliği (ör. "product" / "prod_123").
  entity_type: model.text().nullable(),
  entity_id: model.text().nullable(),
  // Ham HTTP bilgisi (denetim/teşhis için).
  method: model.text().nullable(),
  path: model.text().nullable(),
  status: model.number().nullable(),
  // İsteğe bağlı ek bağlam (değişen alanlar, IP, vb.).
  metadata: model.json().nullable(),
  seller: model.belongsTo(() => Seller, { mappedBy: "audit_logs" }),
})

export default SellerAuditLog
