import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { EXPERT_LEAD_MODULE } from "../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../modules/expert_lead/service"

const STATUSES = ["new", "forwarded", "closed"]

/** GET /admin/expert-requests?status=&q=&limit=&offset= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (status && STATUSES.includes(status)) filters.status = status
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { customer_name: { $ilike: like } },
      { customer_phone: { $ilike: like } },
      { expert_name: { $ilike: like } },
      { city: { $ilike: like } },
    ]
  }

  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  const [requests, count] = await service.listAndCountExpertRequests(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ requests, count, offset, limit })
}
