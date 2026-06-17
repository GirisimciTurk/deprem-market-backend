import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SERVICE_REQUEST_MODULE } from "../../../../modules/service_request"
import type ServiceRequestModuleService from "../../../../modules/service_request/service"
import { autoAssignSeller, snapshotCommissionRate } from "../../../_lib/service-assign"
import {
  applyServicePayment,
  phaseAmount,
  refreshServicePayout,
  type ServicePhase,
} from "../../../_lib/service-payment"
import { sendServicePaymentEmail } from "../../../../lib/service-mail"

const ALL_STATUSES = [
  "talep", "kesif_planlandi", "kesif_yapildi", "teklif_gonderildi", "onaylandi",
  "reddedildi", "tedarik", "teslim_edildi", "montaj_planlandi", "montaj_yapildi",
  "tamamlandi", "iptal",
]
const PAYMENT_STATUSES = ["none", "survey_paid", "deposit_paid", "paid"]

/** GET /admin/service-requests/:id */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const r = await svc.retrieveServiceRequest(req.params.id).catch(() => null)
  if (!r) return res.status(404).json({ message: "Talep bulunamadı." })
  return res.json({ service_request: r })
}

/**
 * POST /admin/service-requests/:id  { action?, seller_id?, status?, ... }
 * action="assign" → seller_id verilirse o bayiye, verilmezse OTOMATİK atar.
 * Aksi halde: durum / not / ödeme alanları güncellenir (admin override).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const r = await svc.retrieveServiceRequest(req.params.id).catch(() => null)
  if (!r) return res.status(404).json({ message: "Talep bulunamadı." })

  const body = (req.body ?? {}) as any

  if (body.action === "assign") {
    if (body.seller_id) {
      await svc.updateServiceRequests({ id: r.id, assigned_seller_id: String(body.seller_id) } as any)
      // Komisyon oranını atanan bayiden snapshot'la (is_house → 0).
      await snapshotCommissionRate(req.scope, r.id, String(body.seller_id)).catch(() => {})
    } else {
      await autoAssignSeller(req.scope, r.id)
    }
    const after = await svc.retrieveServiceRequest(r.id)
    return res.json({ service_request: after })
  }

  // Manuel tahsilat kaydı (PayTR yoksa / havale-EFT ile gelmiş ödeme). Admin
  // override olduğu için müşteri kapısı uygulanmaz; tutar verilmezse faz tutarı.
  if (body.action === "record_payment") {
    const phase = String(body.phase || "") as ServicePhase
    if (!["survey", "deposit", "balance"].includes(phase)) {
      return res.status(400).json({ message: "Geçersiz ödeme fazı." })
    }
    const amount =
      body.amount != null ? Number(body.amount) : phaseAmount(r as any, phase)
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Bu faz için tutar belirlenmemiş." })
    }
    await applyServicePayment(svc, r, { phase, amount, method: "manual" })
    const after = await svc.retrieveServiceRequest(r.id)
    sendServicePaymentEmail(req.scope, after, phase, amount).catch(() => {})
    return res.json({ service_request: after })
  }

  const update: Record<string, unknown> = { id: r.id }
  if (body.status) {
    if (!ALL_STATUSES.includes(body.status)) {
      return res.status(400).json({ message: "Geçersiz durum." })
    }
    update.status = body.status
  }
  if (body.payment_status) {
    if (!PAYMENT_STATUSES.includes(body.payment_status)) {
      return res.status(400).json({ message: "Geçersiz ödeme durumu." })
    }
    update.payment_status = body.payment_status
  }
  if (body.note != null) update.note = String(body.note)
  if (body.survey_fee != null) update.survey_fee = Number(body.survey_fee)
  if (body.deposit_amount != null) update.deposit_amount = Number(body.deposit_amount)
  if (body.balance_amount != null) update.balance_amount = Number(body.balance_amount)
  if (body.commission_rate != null) {
    update.commission_rate = Math.max(0, Math.min(100, Number(body.commission_rate)))
  }

  await svc.updateServiceRequests(update as any)
  // Durum montaj_yapildi/tamamlandi'ya geçtiyse ve tam ödeme alındıysa payout
  // hakedişe (eligible) yükseltilir.
  if (update.status) await refreshServicePayout(svc, r.id)
  const after = await svc.retrieveServiceRequest(r.id)
  return res.json({ service_request: after })
}
