import { model } from "@medusajs/framework/utils"

/**
 * Bir satıcının belirli bir sözleşmenin belirli bir SÜRÜMÜNÜ dijital onayladığının
 * HUKUKİ KAYDI (clickwrap delili). 6098/6563 kapsamında elektronik onayın ispatı için
 * mümkün olduğunca çok kanıt unsuru saklanır:
 *  - created_at .......... onay zaman damgası
 *  - ip .................. onaylayan IP (nginx arkasında X-Forwarded-For)
 *  - user_agent ......... onaylayan tarayıcı/cihaz bilgisi
 *  - full_name .......... onayı veren gerçek kişi (yetkili) beyanı
 *  - content_hash ....... onaylanan METNİN SHA-256 özeti → sonradan metin değişse bile
 *                         "tam olarak şu metin kabul edildi" ispatı
 *  - identity_snapshot .. onay anında satıcının kimlik bilgilerinin kopyası (ünvan, vergi
 *                         no, e-posta vb.) → "kim, hangi kimlikle kabul etti" ispatı
 * Sözleşme sürümü artarsa yeni sürüm için yeni bir onay kaydı gerekir.
 */
const SellerContractAcceptance = model.define("seller_contract_acceptance", {
  id: model.id().primaryKey(),
  seller_id: model.text().index(),
  contract_id: model.text().index(),
  version: model.number(),
  full_name: model.text().nullable(),
  ip: model.text().nullable(),
  user_agent: model.text().nullable(),
  // Onaylanan sözleşme gövdesinin SHA-256 özeti (hex).
  content_hash: model.text().nullable(),
  // Onay anında satıcı kimliğinin kopyası: { legal_name, name, tax_number, email, phone, handle }.
  identity_snapshot: model.json().nullable(),
})

export default SellerContractAcceptance
