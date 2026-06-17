import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SERVICE_REQUEST_MODULE } from "../../../../../modules/service_request"
import type ServiceRequestModuleService from "../../../../../modules/service_request/service"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { getPayTRConfig } from "../../../../../lib/paytr-config"
import { submitPlatformTransfer } from "../../../../../lib/paytr-transfer"
import { computeServicePayout } from "../../../../_lib/service-payment"

/**
 * POST /admin/service-requests/:id/payout
 * Hakedişe gelmiş (payout_status="eligible") bir hizmet talebinin escrow'daki
 * tahsilatını bayiye aktarır (komisyon düşülerek).
 *
 * PayTR yapılandırılmışsa: her tahsilat kalemi (payments[]) için kendi merchant_oid'i
 * üzerinden bayinin IBAN'ına platform transfer talimatı verilir; komisyon kalemler
 * arasında orantılı düşülür. Tümü başarılıysa "paid" işaretlenir.
 * PayTR yoksa: manuel mod — "paid" işaretlenir (havale sistem dışında yapılır).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger")
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const r: any = await svc.retrieveServiceRequest(req.params.id).catch(() => null)
  if (!r) return res.status(404).json({ message: "Talep bulunamadı." })

  if (r.payout_status === "paid") {
    return res.status(400).json({ message: "Bu talebin ödemesi zaten aktarılmış." })
  }
  if (r.payout_status !== "eligible") {
    return res.status(400).json({
      message: "Talep henüz hakedişe gelmedi (tam ödeme + iş teslimi gerekir).",
    })
  }
  if (!r.assigned_seller_id) {
    return res.status(400).json({ message: "Talebe atanmış bayi yok." })
  }

  const { commission_amount, payout_amount } = computeServicePayout(r)
  const rate = Number(r.commission_rate ?? 0)
  const paidAt = new Date()
  const cfg = getPayTRConfig()

  // ── Manuel mod (PayTR yok): doğrudan ödenmiş işaretle. ──
  if (!cfg.configured) {
    await svc.updateServiceRequests({
      id: r.id,
      commission_amount,
      payout_amount,
      payout_status: "paid",
      paid_at: paidAt,
    } as any)
    const after = await svc.retrieveServiceRequest(r.id)
    return res.json({
      service_request: after,
      mode: "manual",
      payout_amount,
      message: "PayTR yapılandırılmamış — manuel (banka) ödeme olarak işaretlendi.",
    })
  }

  // ── PayTR modu: escrow'dan bayi IBAN'ına platform transfer. ──
  const marketplace = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const seller: any = await marketplace.retrieveSeller(r.assigned_seller_id).catch(() => null)
  const transferName = seller?.account_holder || seller?.name || ""
  const transferIban = seller?.iban || ""
  if (!transferIban || !transferName) {
    return res.status(400).json({
      message: "Bayinin IBAN/hesap sahibi bilgisi eksik — PayTR transferi yapılamaz.",
    })
  }

  // PayTR ile tahsil edilmiş (merchant_oid'li) kalemler. Komisyon orantılı düşülür.
  const paidPayments: any[] = (Array.isArray(r.payments) ? r.payments : []).filter(
    (p: any) => p?.status === "paid" && p?.merchant_oid && p?.method === "paytr"
  )
  if (paidPayments.length === 0) {
    return res.status(400).json({
      message:
        "PayTR ile tahsil edilmiş (escrow) kalem yok — manuel ödenmiş tahsilatlar transfer edilemez.",
    })
  }

  const errors: { merchant_oid: string; reason: string }[] = []
  let transferred = 0
  for (const p of paidPayments) {
    const amountMajor = Math.round(Number(p.amount ?? 0))
    const netMajor = Math.round(amountMajor * (1 - rate / 100))
    if (netMajor <= 0) continue
    const result = await submitPlatformTransfer({
      merchantOid: String(p.merchant_oid),
      // Benzersiz transfer referansı: oid + "p" (payout).
      transId: `${String(p.merchant_oid)}p`.replace(/[^a-zA-Z0-9]/g, ""),
      submerchantAmount: netMajor * 100, // kuruş
      totalAmount: amountMajor * 100, // kuruş
      transferName,
      transferIban,
    })
    if (result.status === "success") {
      transferred += netMajor
    } else {
      logger.error(`Hizmet payout: transfer başarısız (${p.merchant_oid}): ${result.reason}`)
      errors.push({ merchant_oid: String(p.merchant_oid), reason: result.reason || "Transfer başarısız." })
    }
  }

  // Hiçbiri başarısız değilse paid; aksi halde eligible bırak (kısmi transfer riski).
  if (errors.length === 0) {
    await svc.updateServiceRequests({
      id: r.id,
      commission_amount,
      payout_amount,
      payout_status: "paid",
      paid_at: paidAt,
      payout_trans_id: paidPayments.map((p) => p.merchant_oid).join(","),
    } as any)
  }
  const after = await svc.retrieveServiceRequest(r.id)
  return res.json({
    service_request: after,
    mode: "paytr",
    payout_amount: transferred,
    error_count: errors.length,
    errors,
    message: errors.length
      ? `${errors.length} transfer başarısız — talep hakediş (eligible) bırakıldı, tekrar deneyin.`
      : `Bayi ödemesi PayTR ile aktarıldı (${transferred} ₺ net).`,
  })
}
