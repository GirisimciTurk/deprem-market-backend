import { model } from "@medusajs/framework/utils"

/**
 * Bir satıcının belirli bir sözleşmenin belirli bir SÜRÜMÜNÜ dijital onayladığının
 * hukuki kaydı (clickwrap): zaman damgası (created_at) + IP + onaylayan ad-soyad.
 * Sözleşme sürümü artarsa yeni sürüm için yeni bir onay kaydı gerekir.
 */
const SellerContractAcceptance = model.define("seller_contract_acceptance", {
  id: model.id().primaryKey(),
  seller_id: model.text().index(),
  contract_id: model.text().index(),
  version: model.number(),
  full_name: model.text().nullable(),
  ip: model.text().nullable(),
})

export default SellerContractAcceptance
