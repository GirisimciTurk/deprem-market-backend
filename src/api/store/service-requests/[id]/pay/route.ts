import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { SERVICE_REQUEST_MODULE } from "../../../../../modules/service_request"
import type ServiceRequestModuleService from "../../../../../modules/service_request/service"
import {
  buildServicePaymentToken,
  encodeServiceOid,
  isPhasePaid,
  phaseAmount,
  recordPendingPayment,
  type ServicePhase,
} from "../../../../_lib/service-payment"
import { hashLimiter, enforceRateLimit } from "../../../../../lib/rate-limiter"

const schema = z.object({
  phase: z.enum(["survey", "deposit", "balance"]),
})

/**
 * Hangi durumlarda hangi faz ödenebilir (müşteri tarafı kapısı). Admin manuel
 * kaydında bu kapı uygulanmaz (admin override). Döndürürse hata mesajı, yoksa null.
 */
function gateError(r: any, phase: ServicePhase): string | null {
  if (["iptal", "reddedildi"].includes(r.status)) return "Bu talep için ödeme alınamaz."
  if (phaseAmount(r, phase) <= 0) return "Bu faz için belirlenmiş bir tutar yok."
  if (isPhasePaid(r, phase)) return "Bu faz zaten ödenmiş."

  if (phase === "deposit") {
    const ok = ["onaylandi", "tedarik", "teslim_edildi", "montaj_planlandi", "montaj_yapildi", "tamamlandi"]
    if (!ok.includes(r.status)) return "Kapora ödemesi için teklifin onaylanması gerekir."
  }
  if (phase === "balance") {
    if (phaseAmount(r, "deposit") > 0 && !isPhasePaid(r, "deposit")) {
      return "Bakiye öncesi kaporanın ödenmesi gerekir."
    }
    const ok = ["teslim_edildi", "montaj_planlandi", "montaj_yapildi", "tamamlandi"]
    if (!ok.includes(r.status)) return "Bakiye, montaj/teslim aşamasında ödenebilir."
  }
  return null
}

/**
 * POST /store/service-requests/:id/pay  { phase: "survey"|"deposit"|"balance" }
 * Müşteri, kendi hizmet talebinin bir fazı için PayTR iFrame ödeme token'ı alır.
 * Tahsilat PayTR koruma hesabında (escrow) bekler; callback ödemeyi talebe işler.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(hashLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Geçersiz ödeme fazı." })
  }
  const phase = parsed.data.phase as ServicePhase

  const customerId = req.auth_context?.actor_id ?? null
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const r = await svc.retrieveServiceRequest(req.params.id).catch(() => null)
  if (!r || !customerId || (r as any).customer_id !== customerId) {
    return res.status(404).json({ success: false, error: "Talep bulunamadı." })
  }

  const gate = gateError(r as any, phase)
  if (gate) return res.status(400).json({ success: false, error: gate })

  const amountMajor = phaseAmount(r as any, phase)
  // attempt = bu faz için mevcut deneme sayısı (merchant_oid benzersizliği).
  const payments: any[] = Array.isArray((r as any).payments) ? (r as any).payments : []
  const attempt = payments.filter((p) => p?.phase === phase).length
  const merchantOid = encodeServiceOid(r.id, phase, attempt)

  const rawIp =
    (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "0.0.0.0"
  const userIp = rawIp.split(",")[0].trim()

  const result = await buildServicePaymentToken({
    request: r,
    phase,
    amountMajor,
    merchantOid,
    userIp,
  })
  if (!result.ok) {
    // PayTR yoksa 503 (manuel modda admin tahsilatı elle işaretler).
    const code = result.error.includes("yapılandırılmamış") ? 503 : 502
    return res.status(code).json({ success: false, error: result.error })
  }

  // Bekleyen tahsilat kalemini yaz (callback bu merchant_oid ile eşleştirir).
  await recordPendingPayment(svc, r, { phase, amount: amountMajor, merchant_oid: merchantOid })

  return res.status(200).json({ success: true, iframe_token: result.token })
}
