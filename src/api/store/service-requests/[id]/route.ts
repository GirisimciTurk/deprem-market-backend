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

  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const body = (req.body ?? {}) as Record<string, unknown>

  // ── (A) Değerlendirme yöntemi belirleme (Ürün + Hizmet sonrası, hesaptan) ──
  // Müşteri "media" (foto/video) ya da "survey" (yerinde keşif) seçer. Talep havuzda
  // kalır; bayiler bu bilgiye göre uzaktan/keşifle fiyat verir.
  if (typeof body.assessment_mode === "string") {
    const aParsed = z
      .object({
        assessment_mode: z.enum(["media", "survey"]),
        media: z
          .array(z.object({ url: z.string().url(), type: z.string().optional() }))
          .max(8)
          .optional(),
        preferred_dates: z.array(z.string()).max(3).optional(),
        city: z.string().optional(),
        district: z.string().optional(),
        address: z.string().optional(),
        note: z.string().optional(),
      })
      .safeParse(body)
    if (!aParsed.success) {
      return res.status(400).json({ message: "Geçersiz değerlendirme verisi." })
    }
    // Yalnız teklif öncesi (erken) aşamada seçilebilir/değiştirilebilir.
    if (!["talep", "kesif_planlandi"].includes(r.status)) {
      return res
        .status(400)
        .json({ message: "Bu aşamada değerlendirme yöntemi değiştirilemez." })
    }
    const d = aParsed.data
    await svc.updateServiceRequests({
      id: r.id,
      assessment_mode: d.assessment_mode,
      requires_survey: d.assessment_mode === "survey",
      ...(d.media ? { media: d.media } : {}),
      ...(d.preferred_dates ? { preferred_dates: d.preferred_dates } : {}),
      ...(d.city !== undefined ? { city: d.city } : {}),
      ...(d.district !== undefined ? { district: d.district } : {}),
      ...(d.address !== undefined ? { address: d.address } : {}),
      ...(d.note !== undefined ? { note: d.note } : {}),
    } as any)
    const updated = await svc.retrieveServiceRequest(r.id)
    return res.json({ service_request: updated })
  }

  // ── (B) Teklif kararı (onay/ret) ──
  const parsed = z.object({ decision: z.enum(["accept", "reject"]) }).safeParse(body)
  if (!parsed.success) return res.status(400).json({ message: "Geçersiz karar." })

  if (r.status !== "teklif_gonderildi") {
    return res.status(400).json({ message: "Onaylanacak/reddedilecek bir teklif yok." })
  }

  const accepted = parsed.data.decision === "accept"
  await svc.updateServiceRequests({
    id: r.id,
    offer_decision: accepted ? "accepted" : "rejected",
    status: accepted ? "onaylandi" : "reddedildi",
  } as any)
  const after = await svc.retrieveServiceRequest(r.id)
  return res.json({ service_request: after })
}
