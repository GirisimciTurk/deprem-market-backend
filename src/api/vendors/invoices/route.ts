import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { INVOICING_MODULE } from "../../../modules/invoicing"
import InvoicingModuleService from "../../../modules/invoicing/service"
import { resolveSeller } from "../_lib/resolve-seller"

/**
 * GET /vendors/invoices?type=&limit=&offset= — satıcının faturaları.
 * "sale": satıcının müşteriye kestiği; "commission": platformun satıcıya kestiği.
 * İkisinde de seller_id satıcıdır.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const type = req.query.type as string | undefined

  const filters: Record<string, unknown> = { seller_id: resolved.seller.id }
  if (type && ["sale", "commission"].includes(type)) filters.type = type

  const invoicing: InvoicingModuleService = req.scope.resolve(INVOICING_MODULE)
  const [invoices, count] = await invoicing.listAndCountInvoices(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ invoices, count, offset, limit })
}
