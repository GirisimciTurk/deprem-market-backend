import { model } from "@medusajs/framework/utils"

/**
 * Platform-geneli satıcı sözleşmesi (örn. "Satıcı Çerçeve Sözleşmesi", "KVKK Aydınlatma").
 * TÜM aktif + required sözleşmeleri satıcı, panelde dijital olarak onaylamadan (clickwrap)
 * ürün ekleyip satış yapamaz. `version` artırılırsa satıcılar yeni sürümü tekrar onaylamalı.
 * İçerik HTML gövde (body) ve/veya yüklenen PDF (pdf_url) olabilir — panel ikisini de gösterir.
 */
const SellerContract = model.define("seller_contract", {
  id: model.id().primaryKey(),
  title: model.text(),
  version: model.number().default(1),
  body: model.text().nullable(),
  pdf_url: model.text().nullable(),
  // Yayında mı (satıcılara gösterilsin mi).
  is_active: model.boolean().default(true).index(),
  // Onayı ZORUNLU mu (false ise bilgilendirme amaçlı, satışı engellemez).
  required: model.boolean().default(true),
})

export default SellerContract
