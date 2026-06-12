import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INVOICING_MODULE } from "../../../../modules/invoicing"
import InvoicingModuleService from "../../../../modules/invoicing/service"

/** GET /admin/invoices/:id — fatura detayı (UBL-TR taslak verisi dahil). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const invoicing: InvoicingModuleService = req.scope.resolve(INVOICING_MODULE)
  const invoice = await invoicing.retrieveInvoice(req.params.id).catch(() => null)
  if (!invoice) return res.status(404).json({ message: "Fatura bulunamadı." })
  return res.json({ invoice })
}
