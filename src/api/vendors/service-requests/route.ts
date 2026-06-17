import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../_lib/resolve-seller"
import { SERVICE_REQUEST_MODULE } from "../../../modules/service_request"
import type ServiceRequestModuleService from "../../../modules/service_request/service"

/** GET /vendors/service-requests?status= — bu bayiye atanan özel hizmet talepleri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const status = req.query.status as string | undefined
  const filters: Record<string, unknown> = { assigned_seller_id: resolved.seller.id }
  if (status) filters.status = status

  const service_requests = await svc.listServiceRequests(filters, {
    order: { created_at: "DESC" },
  })
  return res.json({ service_requests })
}
