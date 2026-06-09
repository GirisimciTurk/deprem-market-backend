import { model } from "@medusajs/framework/utils"

/**
 * Bayilik başvurusu — storefront formundan gelir, admin panelden değerlendirilir.
 * `pending` → admin `approved`/`rejected` yapar.
 */
const ResellerApplication = model.define("reseller_application", {
  id: model.id().primaryKey(),
  company_name: model.text(),
  applicant_name: model.text().default(""),
  email: model.text().index(),
  phone: model.text().default(""),
  city: model.text().default(""),
  tax_number: model.text().default(""),
  message: model.text().default(""),
  status: model.enum(["pending", "approved", "rejected"]).default("pending"),
})

export default ResellerApplication
