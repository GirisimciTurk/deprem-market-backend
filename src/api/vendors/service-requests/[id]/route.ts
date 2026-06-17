import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../../_lib/resolve-seller"
import { SERVICE_REQUEST_MODULE } from "../../../../modules/service_request"
import type ServiceRequestModuleService from "../../../../modules/service_request/service"
import { autoAssignSeller } from "../../../_lib/service-assign"
import { refreshServicePayout } from "../../../_lib/service-payment"

/** Talebin bu bayiye atanmış olduğunu doğrular. */
async function getOwned(req: MedusaRequest, sellerId: string) {
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const r = await svc.retrieveServiceRequest(req.params.id).catch(() => null)
  if (!r || (r as any).assigned_seller_id !== sellerId) return null
  return r as any
}

// Bayinin geçirebileceği durumlar (keşif/teklif kendi uçlarından; burası montaj/tedarik akışı).
const VENDOR_STATUSES = [
  "tedarik",
  "teslim_edildi",
  "montaj_planlandi",
  "montaj_yapildi",
  "tamamlandi",
]

/** GET /vendors/service-requests/:id — bayiye atanan talebin detayı. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  const r = await getOwned(req, resolved.seller.id)
  if (!r) return res.status(404).json({ message: "Talep bulunamadı." })
  return res.json({ service_request: r })
}

/**
 * POST /vendors/service-requests/:id  { action, ... }
 * action: "survey" (keşif raporu/randevu) | "offer" (teklif gönder) |
 *         "status" (tedarik/teslim/montaj/tamamla) | "reject" (reddet → yeniden ata).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  const r = await getOwned(req, resolved.seller.id)
  if (!r) return res.status(404).json({ message: "Talep bulunamadı." })

  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const body = (req.body ?? {}) as any
  const update: Record<string, unknown> = { id: r.id }

  switch (body.action) {
    case "survey": {
      if (body.survey_report != null) update.survey_report = String(body.survey_report)
      if (body.survey_scheduled_at) {
        update.survey_scheduled_at = new Date(body.survey_scheduled_at)
        if (r.status === "talep") update.status = "kesif_planlandi"
      }
      if (body.survey_done) {
        update.survey_done_at = new Date()
        update.status = "kesif_yapildi"
      }
      break
    }
    case "offer": {
      const schema = z.object({
        offer_items: z
          .array(
            z.object({
              label: z.string(),
              qty: z.coerce.number().optional(),
              unit_price: z.coerce.number().optional(),
              total: z.coerce.number().optional(),
            })
          )
          .optional(),
        offer_total: z.coerce.number().positive(),
        offer_valid_until: z.string().optional(),
      })
      const p = schema.safeParse(body)
      if (!p.success) return res.status(400).json({ message: "Geçersiz teklif verisi." })
      update.offer_items = p.data.offer_items ?? null
      update.offer_total = p.data.offer_total
      if (p.data.offer_valid_until) update.offer_valid_until = new Date(p.data.offer_valid_until)
      update.offer_sent_at = new Date()
      update.offer_decision = "pending"
      update.status = "teklif_gonderildi"
      break
    }
    case "status": {
      if (!VENDOR_STATUSES.includes(body.status)) {
        return res.status(400).json({ message: "Geçersiz durum geçişi." })
      }
      update.status = body.status
      if (body.status === "montaj_planlandi" && body.install_scheduled_at) {
        update.install_scheduled_at = new Date(body.install_scheduled_at)
      }
      if (body.status === "montaj_yapildi") update.install_done_at = new Date()
      break
    }
    case "reject": {
      const rejected: string[] = Array.isArray(r.rejected_seller_ids) ? r.rejected_seller_ids : []
      await svc.updateServiceRequests({
        id: r.id,
        assigned_seller_id: null,
        rejected_seller_ids: [...rejected, resolved.seller.id],
      } as any)
      const reassign = await autoAssignSeller(req.scope, r.id)
      const after = await svc.retrieveServiceRequest(r.id)
      return res.json({ service_request: after, reassigned: reassign.assigned })
    }
    default:
      return res.status(400).json({ message: "Geçersiz işlem (action)." })
  }

  await svc.updateServiceRequests(update as any)
  // İş montaj_yapildi/tamamlandi'ya geçtiyse ve tam ödeme alındıysa payout hakedişe yükselir.
  if (update.status) await refreshServicePayout(svc, r.id)
  const after = await svc.retrieveServiceRequest(r.id)
  return res.json({ service_request: after })
}
