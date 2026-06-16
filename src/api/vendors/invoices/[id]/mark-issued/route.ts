import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { INVOICING_MODULE } from "../../../../../modules/invoicing"
import InvoicingModuleService from "../../../../../modules/invoicing/service"
import { resolveSeller } from "../../../_lib/resolve-seller"

const schema = z.object({ invoice_number: z.string().trim().min(1).max(64) })

/**
 * POST /vendors/invoices/:id/mark-issued { invoice_number }
 * Satıcı, müşteriye kestiği SATIŞ faturasının resmi numarasını girip "Düzenlendi"
 * işaretler (entegratör API'si olmadan manuel takip). Yalnız kendi `sale` faturası.
 * Komisyon faturası platform (admin) tarafından kesilir → satıcı işaretleyemez.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const invoicing: InvoicingModuleService = req.scope.resolve(INVOICING_MODULE)
  const invoice = await invoicing.retrieveInvoice(req.params.id).catch(() => null)
  if (!invoice || (invoice as any).seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Fatura bulunamadı." })
  }
  if ((invoice as any).type !== "sale") {
    return res.status(403).json({
      message: "Yalnızca kendi satış faturanızı düzenlendi işaretleyebilirsiniz (komisyon faturasını platform keser).",
    })
  }

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
