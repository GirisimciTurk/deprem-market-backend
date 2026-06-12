import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INVOICING_MODULE } from "../../../modules/invoicing"
import InvoicingModuleService from "../../../modules/invoicing/service"

/** GET /admin/invoices?type=&status=&seller_id=&q=&limit=&offset= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const type = req.query.type as string | undefined
  const status = req.query.status as string | undefined
  const seller_id = req.query.seller_id as string | undefined
  const q = (req.query.q as string | undefined)?.trim()

  const filters: Record<string, unknown> = {}
  if (type && ["sale", "commission"].includes(type)) filters.type = type
  if (status && ["draft", "sent", "error"].includes(status)) filters.status = status
  if (seller_id) filters.seller_id = seller_id
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { draft_number: { $ilike: like } },
      { recipient_name: { $ilike: like } },
      { issuer_name: { $ilike: like } },
    ]
  }

  const invoicing: InvoicingModuleService = req.scope.resolve(INVOICING_MODULE)
  const [invoices, count] = await invoicing.listAndCountInvoices(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ invoices, count, offset, limit })
}
