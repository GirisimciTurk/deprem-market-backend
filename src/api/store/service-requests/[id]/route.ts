import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { SERVICE_REQUEST_MODULE } from "../../../../modules/service_request"
import type ServiceRequestModuleService from "../../../../modules/service_request/service"

/** Talebin giriş yapmış müşteriye ait olduğunu doğrular. */
async function getOwn(req: AuthenticatedMedusaRequest, customerId: string | null) {
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const r = await svc.retrieveServiceRequest(req.params.id).catch(() => null)
  if (!r || !customerId || (r as any).customer_id !== customerId) return null
  return r as any
}

/** GET /store/service-requests/:id — müşterinin kendi talebinin detayı/durumu. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id ?? null
  const r = await getOwn(req, customerId)
  if (!r) return res.status(404).json({ message: "Talep bulunamadı." })
  return res.json({ service_request: r })
}

/**
 * POST /store/service-requests/:id  { decision: "accept" | "reject" }
 * Müşteri gönderilen teklifi onaylar/reddeder. Yalnız "teklif_gonderildi"
 * durumundaki talepte geçerli.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id ?? null
  const r = await getOwn(req, customerId)
  if (!r) return res.status(404).json({ message: "Talep bulunamadı." })

  const parsed = z.object({ decision: z.enum(["accept", "reject"]) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Geçersiz karar." })

  if (r.status !== "teklif_gonderildi") {
    return res.status(400).json({ message: "Onaylanacak/reddedilecek bir teklif yok." })
  }

  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const accepted = parsed.data.decision === "accept"
  await svc.updateServiceRequests({
    id: r.id,
    offer_decision: accepted ? "accepted" : "rejected",
    status: accepted ? "onaylandi" : "reddedildi",
  } as any)
  const after = await svc.retrieveServiceRequest(r.id)
  return res.json({ service_request: after })
}
