import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SERVICE_REQUEST_MODULE } from "../../../modules/service_request"
import type ServiceRequestModuleService from "../../../modules/service_request/service"

/** GET /admin/service-requests?status=&limit=&offset= — tüm özel hizmet talepleri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const status = req.query.status as string | undefined
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (status) filters.status = status

  const [service_requests, count] = await svc.listAndCountServiceRequests(filters, {
    order: { created_at: "DESC" },
    take: limit,
    skip: offset,
  })
  return res.json({ service_requests, count, limit, offset })
}
