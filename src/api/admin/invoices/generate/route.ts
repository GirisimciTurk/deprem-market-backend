import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { generateInvoicesForOrder } from "../../../../lib/einvoice/generate"

const schema = z.object({ order_id: z.string().min(1) })

/**
 * POST /admin/invoices/generate { order_id } — sipariş için satıcı bazında taslak
 * fatura üretir (satış + komisyon). İdempotent.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "order_id gerekli." })
  }
  const created = await generateInvoicesForOrder(req.scope, parsed.data.order_id)
  return res.json({ ok: true, created })
}
