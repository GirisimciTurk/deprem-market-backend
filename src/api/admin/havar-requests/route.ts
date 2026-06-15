import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HAVAR_MODULE } from "../../../modules/havar"
import HavarModuleService from "../../../modules/havar/service"

/** GET /admin/havar-requests?type=&status=&q=&limit=&offset= — HAVAR talepleri (admin). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const type = req.query.type as string | undefined
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (type && ["purchase", "rental"].includes(type)) filters.type = type
  if (status && ["pending", "reviewed", "contacted", "closed"].includes(status)) filters.status = status
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { full_name: { $ilike: like } },
      { email: { $ilike: like } },
      { city: { $ilike: like } },
    ]
  }

  const havar: HavarModuleService = req.scope.resolve(HAVAR_MODULE)
  const [requests, count] = await havar.listAndCountHavarRequests(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ requests, count, offset, limit })
}
