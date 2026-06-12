import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INVOICING_MODULE } from "../../../../../modules/invoicing"
import InvoicingModuleService from "../../../../../modules/invoicing/service"
import { getInvoiceProvider } from "../../../../../lib/einvoice/providers"

/**
 * POST /admin/invoices/:id/send — faturayı yapılandırılmış entegratöre gönderir.
 * Entegratör tanımlı değilse fail-closed: 400 + "draft modu" mesajı, durum 'error'.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const invoicing: InvoicingModuleService = req.scope.resolve(INVOICING_MODULE)
  const invoice = await invoicing.retrieveInvoice(req.params.id).catch(() => null)
  if (!invoice) return res.status(404).json({ message: "Fatura bulunamadı." })
  if (invoice.status === "sent") {
    return res.status(400).json({ message: "Fatura zaten gönderilmiş." })
  }

  const provider = getInvoiceProvider()
  if (!provider.configured) {
    await invoicing.updateInvoices({
      id: invoice.id,
      status: "error",
      error_message: "E-fatura entegratörü tanımlı değil (draft modu).",
    } as any)
    return res.status(400).json({
      message:
        "E-fatura entegratörü tanımlı değil. Gönderim için EINVOICE_PROVIDER ve kimlikleri ayarlayın.",
    })
  }

  const result = await provider.send({
    invoiceId: invoice.id,
    type: invoice.type as "sale" | "commission",
    draftNumber: invoice.draft_number,
    ublPayload: invoice.ubl_payload,
  })

  await invoicing.updateInvoices({
    id: invoice.id,
    status: result.status,
    external_id: result.externalId ?? null,
    invoice_number: result.invoiceNumber ?? invoice.invoice_number,
    sent_at: result.status === "sent" ? new Date() : null,
    error_message: result.error ?? null,
    provider: provider.name,
  } as any)

  return res.json({ ok: result.status === "sent", result })
}
