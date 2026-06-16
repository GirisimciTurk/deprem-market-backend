import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { INVOICING_MODULE } from "../../../../../modules/invoicing"
import InvoicingModuleService from "../../../../../modules/invoicing/service"

const schema = z.object({ invoice_number: z.string().trim().min(1).max(64) })

/**
 * POST /admin/invoices/:id/mark-issued { invoice_number }
 * Entegratör API'si OLMADAN manuel kesim takibi: faturayı başka bir yerde
 * (muhasebeci / entegratör paneli / GİB e-Arşiv) kesip resmi numarasını buraya
 * girersin → durum "sent" (Düzenlendi), provider "manual" olur.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const invoicing: InvoicingModuleService = req.scope.resolve(INVOICING_MODULE)
  const invoice = await invoicing.retrieveInvoice(req.params.id).catch(() => null)
  if (!invoice) return res.status(404).json({ message: "Fatura bulunamadı." })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçerli bir resmi fatura numarası girin." })
  }

  const updated = await invoicing.updateInvoices({
    id: invoice.id,
    invoice_number: parsed.data.invoice_number,
    status: "sent",
    provider: "manual",
    sent_at: new Date(),
    error_message: null,
  } as any)

  return res.json({ invoice: updated })
}
