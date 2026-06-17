import { getPayTRConfig } from "../../lib/paytr-config"
import { buildGetTokenHash } from "../../lib/paytr-hash"

/**
 * Hizmet talebi (keşifli kurulum) ÖDEME / ESCROW yardımcıları (D fazı).
 *
 * Normal sipariş ödemesinden farkı: ortada Medusa sepeti/siparişi YOKTUR. Müşteri
 * doğrudan bir hizmet talebi için faz faz öder (keşif ücreti → kapora → bakiye).
 * Her tahsilat PayTR koruma hesabında (escrow) bekler; iş teslim edilip tam ödeme
 * alınınca payout "eligible" olur ve admin bayiye (komisyon düşülerek) aktarır.
 *
 * TUTAR BİRİMİ: service_request tutarları TAM LİRA (major) saklanır (model.number()
 * integer). PayTR ise payment_amount/submerchant_amount'u "TL × 100" (kuruş) bekler
 * → PayTR'a giderken ×100 yapılır; talepte saklanırken major kalır.
 */

export type ServicePhase = "survey" | "deposit" | "balance"

const PHASE_TO_CHAR: Record<ServicePhase, string> = {
  survey: "s",
  deposit: "d",
  balance: "b",
}
const CHAR_TO_PHASE: Record<string, ServicePhase> = {
  s: "survey",
  d: "deposit",
  b: "balance",
}

export const PHASE_AMOUNT_FIELD: Record<
  ServicePhase,
  "survey_fee" | "deposit_amount" | "balance_amount"
> = {
  survey: "survey_fee",
  deposit: "deposit_amount",
  balance: "balance_amount",
}

export const SERVICE_OID_PREFIX = "srq"

/**
 * merchant_oid kodlaması. service_request id'leri bu kurulumda PREFIX'SİZ, 26
 * karakterlik saf ULID (alfanümerik) → doğrudan gömülür (ek strip/escape gerekmez).
 *   merchant_oid = "srq" + <id(26)> + <fazChar(1)> + <attempt(opsiyonel sayı)>
 * attempt yalnız PayTR'ın "merchant_oid benzersiz olmalı" şartı için (başarısız
 * denemeden sonra retry'da çakışmasın); decode onu yok sayar.
 */
export function encodeServiceOid(id: string, phase: ServicePhase, attempt = 0): string {
  return `${SERVICE_OID_PREFIX}${id}${PHASE_TO_CHAR[phase]}${attempt > 0 ? attempt : ""}`
}

export function isServiceOid(oid: string): boolean {
  return typeof oid === "string" && oid.startsWith(SERVICE_OID_PREFIX)
}

/** merchant_oid → { id, phase }. Bozuk/eşleşmeyen değerde null. */
export function decodeServiceOid(
  oid: string
): { id: string; phase: ServicePhase } | null {
  if (!isServiceOid(oid)) return null
  const body = oid.slice(SERVICE_OID_PREFIX.length) // <id(26)><fazChar><attempt?>
  if (body.length < 27) return null
  const id = body.slice(0, 26)
  const phase = CHAR_TO_PHASE[body.charAt(26)]
  if (!phase) return null
  return { id, phase }
}

/** Bir faz için müşterinin ödemesi gereken tutar (TL major). */
export function phaseAmount(request: any, phase: ServicePhase): number {
  return Math.round(Number(request[PHASE_AMOUNT_FIELD[phase]] ?? 0))
}

/** Bu faz daha önce (pending değil) başarıyla ödenmiş mi? */
export function isPhasePaid(request: any, phase: ServicePhase): boolean {
  const list: any[] = Array.isArray(request?.payments) ? request.payments : []
  return list.some((p) => p?.phase === phase && p?.status === "paid")
}

/**
 * payments[]'ten ödeme durumunu türet (monotonik: bakiye en son faz).
 *   none → survey_paid → deposit_paid → paid
 * "paid" = işin bedeli tam tahsil (bakiye ödendi; kapora yoksa tek seferde).
 */
export function derivePaymentStatus(
  request: any
): "none" | "survey_paid" | "deposit_paid" | "paid" {
  if (isPhasePaid(request, "balance")) return "paid"
  if (isPhasePaid(request, "deposit")) return "deposit_paid"
  if (isPhasePaid(request, "survey")) return "survey_paid"
  return "none"
}

/** İş fiilen teslim/montaj aşamasında mı (escrow serbest bırakma ön-koşulu)? */
export function isWorkDelivered(request: any): boolean {
  return ["montaj_yapildi", "tamamlandi"].includes(String(request?.status))
}

/**
 * Komisyon + bayi net hakedişi (TL major). Komisyon TABANI tahsil edilen TOPLAM
 * (paid_total): keşif ücreti dahil platformun işlem cirosundan oranı alınır.
 * is_house bayilerde atama anında commission_rate=0 snapshot'lanır → komisyon 0.
 */
export function computeServicePayout(request: any): {
  commission_amount: number
  payout_amount: number
} {
  const rate = Number(request?.commission_rate ?? 0)
  const paidTotal = Math.round(Number(request?.paid_total ?? 0))
  const commission = Math.max(0, Math.round((paidTotal * rate) / 100))
  return {
    commission_amount: commission,
    payout_amount: Math.max(0, paidTotal - commission),
  }
}

/**
 * Tam ödeme + iş teslim → payout "eligible" (+ komisyon/payout hesapla). Idempotent;
 * yalnız payout_status="pending" iken yükseltir. Hem ödeme işleyen yer hem de
 * durum ilerleten (admin/bayi) uçlar çağırır; sıra fark etmez.
 */
export async function refreshServicePayout(svc: any, requestId: string): Promise<void> {
  const r = await svc.retrieveServiceRequest(requestId).catch(() => null)
  if (!r || r.payout_status !== "pending") return
  if (derivePaymentStatus(r) !== "paid" || !isWorkDelivered(r)) return
  const { commission_amount, payout_amount } = computeServicePayout(r)
  await svc.updateServiceRequests({
    id: r.id,
    commission_amount,
    payout_amount,
    payout_status: "eligible",
  } as any)
}

/**
 * Bir faz ödemesini talebe işler (PayTR callback + admin manuel kaydı ortak kullanır).
 * payments[]'e kalemi ekler/pending'i kapatır, paid_total + payment_status'u tazeler,
 * sonra payout eligibility'yi yeniden değerlendirir.
 * Idempotent: aynı merchant_oid "paid" olarak ikinci kez gelirse yok sayar.
 */
export async function applyServicePayment(
  svc: any,
  request: any,
  args: {
    phase: ServicePhase
    amount: number
    merchant_oid?: string | null
    method?: "paytr" | "manual"
    paid_at?: Date
  }
): Promise<{ changed: boolean }> {
  const payments: any[] = Array.isArray(request?.payments) ? [...request.payments] : []
  const oid = args.merchant_oid ?? null

  if (oid && payments.some((p) => p?.merchant_oid === oid && p?.status === "paid")) {
    return { changed: false }
  }

  const entry = {
    phase: args.phase,
    amount: Math.round(args.amount),
    merchant_oid: oid,
    method: args.method ?? (oid ? "paytr" : "manual"),
    status: "paid" as const,
    paid_at: (args.paid_at ?? new Date()).toISOString(),
  }

  // Aynı faz için bekleyen (pending) kalemi varsa kapat; yoksa yeni ekle.
  const pendingIdx = payments.findIndex(
    (p) => p?.phase === args.phase && p?.status === "pending" && (!oid || p?.merchant_oid === oid)
  )
  if (pendingIdx >= 0) payments[pendingIdx] = entry
  else payments.push(entry)

  const paid_total = payments
    .filter((p) => p?.status === "paid")
    .reduce((s, p) => s + Math.round(Number(p.amount ?? 0)), 0)

  const merged = { ...request, payments, paid_total }
  await svc.updateServiceRequests({
    id: request.id,
    payments,
    paid_total,
    payment_status: derivePaymentStatus(merged),
  } as any)

  await refreshServicePayout(svc, request.id)
  return { changed: true }
}

/** Bekleyen (pending) bir tahsilat kalemini payments[]'e yazar (PayTR token üretiminde). */
export async function recordPendingPayment(
  svc: any,
  request: any,
  args: { phase: ServicePhase; amount: number; merchant_oid: string }
): Promise<void> {
  const payments: any[] = Array.isArray(request?.payments) ? [...request.payments] : []
  // Aynı faz için eski pending kayıtları tek bir güncel pending'le değiştir.
  const next = payments.filter((p) => !(p?.phase === args.phase && p?.status === "pending"))
  next.push({
    phase: args.phase,
    amount: Math.round(args.amount),
    merchant_oid: args.merchant_oid,
    method: "paytr",
    status: "pending",
    created_at: new Date().toISOString(),
  })
  await svc.updateServiceRequests({ id: request.id, payments: next } as any)
}

/**
 * Bir hizmet talebi + faz için PayTR iFrame ödeme token'ı üretir (sepetsiz).
 * Tutar TL major → PayTR'a kuruş (×100) gider. merchant_oid = encodeServiceOid.
 */
export async function buildServicePaymentToken(p: {
  request: any
  phase: ServicePhase
  amountMajor: number
  merchantOid: string
  userIp: string
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const cfg = getPayTRConfig()
  if (!cfg.configured) return { ok: false, error: "PayTR yapılandırılmamış." }

  const r = p.request
  const amountKurus = Math.round(p.amountMajor * 100)
  if (!amountKurus || amountKurus <= 0) return { ok: false, error: "Geçersiz tutar." }

  const email = r.email || "musteri@depremtek.market"
  const phaseLabel =
    p.phase === "survey" ? "Keşif Ücreti" : p.phase === "deposit" ? "Kapora" : "Bakiye"
  const basket = [
    [`${r.service_title || "Hizmet"} — ${phaseLabel}`.slice(0, 100), p.amountMajor.toFixed(2), 1],
  ]
  const userBasket = Buffer.from(JSON.stringify(basket)).toString("base64")

  const token = buildGetTokenHash({
    merchantId: cfg.merchantId,
    userIp: p.userIp,
    merchantOid: p.merchantOid,
    email,
    paymentAmount: String(amountKurus),
    userBasket,
    noInstallment: "0",
    maxInstallment: "0",
    currency: "TL",
    testMode: cfg.testMode,
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
  })

  const form = new URLSearchParams()
  form.append("merchant_id", cfg.merchantId)
  form.append("merchant_oid", p.merchantOid)
  form.append("email", email)
  form.append("payment_amount", String(amountKurus))
  form.append("paytr_token", token)
  form.append("user_basket", userBasket)
  form.append("no_installment", "0")
  form.append("max_installment", "0")
  form.append("user_name", r.full_name || "Müşteri")
  form.append("user_address", [r.address, r.district, r.city].filter(Boolean).join(" ") || "-")
  form.append("user_phone", r.phone || "0000000000")
  form.append("user_ip", p.userIp)
  form.append("merchant_ok_url", `${cfg.okUrl}&kind=service`)
  form.append("merchant_fail_url", `${cfg.failUrl}&kind=service`)
  form.append("timeout_limit", "30")
  form.append("currency", "TL")
  form.append("test_mode", cfg.testMode)
  form.append("debug_on", cfg.isProduction ? "0" : "1")

  try {
    const res = await fetch(`${cfg.baseUrl}/odeme/api/get-token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const json: any = await res.json().catch(() => ({}))
    if (json.status !== "success") {
      return { ok: false, error: json.reason || "PayTR token alınamadı." }
    }
    return { ok: true, token: json.token }
  } catch (e: any) {
    return { ok: false, error: e?.message || "PayTR token oluşturulamadı." }
  }
}
