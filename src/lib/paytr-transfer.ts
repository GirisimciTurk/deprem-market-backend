import { getPayTRConfig } from "./paytr-config"
import {
  buildTransferHash,
  buildReturnedTransfersHash,
  buildResendHash,
} from "./paytr-hash"

/**
 * PayTR Pazaryeri — para aktarma (escrow serbest bırakma) yardımcıları.
 *
 * Tahsilat PayTR koruma hesabında bekler (escrow). Satıcının hak edişi
 * (eligible) olunca buradan IBAN'ına aktarma talimatı verilir → para serbest
 * bırakılır. Başarısız (yanlış IBAN vb.) aktarmalar "geri dönen transfer"e düşer.
 *
 * TUTAR BİRİMİ: PayTR submerchant_amount/total_amount alanlarını "TL × 100"
 * (yani kuruş) bekler. Sistemimizdeki tüm tutarlar ZATEN kuruş (minor unit) →
 * olduğu gibi gönderilir, ek ×100 YAPILMAZ.
 */

export type TransferResult = {
  status: "success" | "error"
  trans_id?: string
  reason?: string
  raw?: unknown
}

/**
 * Bir satıcıya PayTR koruma hesabından IBAN'ına aktarma talimatı verir.
 * @param merchantOid Tahsilatın yapıldığı orijinal sipariş referansı (PayTR'a ödeme anında gönderilen merchant_oid).
 * @param transId Bizim ürettiğimiz benzersiz transfer referansı (idempotluk + takip).
 * @param submerchantAmount Satıcıya gidecek NET tutar (kuruş).
 * @param totalAmount Siparişin PayTR'da tahsil edilen toplam tutarı (kuruş).
 */
export async function submitPlatformTransfer(p: {
  merchantOid: string
  transId: string
  submerchantAmount: number
  totalAmount: number
  transferName: string
  transferIban: string
}): Promise<TransferResult> {
  const cfg = getPayTRConfig()
  if (!cfg.configured) {
    return { status: "error", reason: "PayTR yapılandırılmamış (kimlik bilgileri yok)." }
  }
  if (!p.transferIban || !p.transferName) {
    return { status: "error", reason: "Satıcı IBAN/ünvan bilgisi eksik." }
  }

  const submAmt = String(Math.round(p.submerchantAmount))
  const total = String(Math.round(p.totalAmount))

  const token = buildTransferHash({
    merchantId: cfg.merchantId,
    merchantOid: p.merchantOid,
    transId: p.transId,
    submerchantAmount: submAmt,
    totalAmount: total,
    transferName: p.transferName,
    transferIban: p.transferIban,
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
  })

  const form = new URLSearchParams()
  form.append("merchant_id", cfg.merchantId)
  form.append("merchant_oid", p.merchantOid)
  form.append("trans_id", p.transId)
  form.append("submerchant_amount", submAmt)
  form.append("total_amount", total)
  form.append("transfer_name", p.transferName)
  form.append("transfer_iban", p.transferIban)
  form.append("paytr_token", token)

  try {
    const res = await fetch(`${cfg.baseUrl}/odeme/platform/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const text = await res.text()
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      return { status: "error", reason: `PayTR yanıtı JSON değil: ${text.slice(0, 200)}`, raw: text }
    }
    if (json.status === "success") {
      return { status: "success", trans_id: p.transId, raw: json }
    }
    return { status: "error", reason: json.reason || json.err_msg || "Bilinmeyen hata", raw: json }
  } catch (e: any) {
    return { status: "error", reason: e?.message || "Ağ hatası", raw: null }
  }
}

/** Belirli tarih aralığındaki geri dönen (başarısız) transferleri listeler. */
export async function listReturnedTransfers(p: {
  startDate: string // yyyy-mm-dd
  endDate: string
}): Promise<{ status: "success" | "error"; returns?: unknown[]; reason?: string }> {
  const cfg = getPayTRConfig()
  if (!cfg.configured) return { status: "error", reason: "PayTR yapılandırılmamış." }

  const token = buildReturnedTransfersHash({
    merchantId: cfg.merchantId,
    startDate: p.startDate,
    endDate: p.endDate,
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
  })
  const form = new URLSearchParams()
  form.append("merchant_id", cfg.merchantId)
  form.append("start_date", p.startDate)
  form.append("end_date", p.endDate)
  form.append("paytr_token", token)
  form.append("dummy", "1")

  try {
    const res = await fetch(`${cfg.baseUrl}/odeme/geri-donen-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const json: any = await res.json().catch(() => ({}))
    if (json.status === "success") return { status: "success", returns: json.returns ?? [] }
    return { status: "error", reason: json.reason || json.err_msg || "Bilinmeyen hata" }
  } catch (e: any) {
    return { status: "error", reason: e?.message || "Ağ hatası" }
  }
}

/** Geri dönen bir ödemeyi (düzeltilmiş bilgilerle) hesaptan yeniden gönderir. */
export async function resendReturnedPayment(p: {
  transId: string
  transInfo: unknown // PayTR'ın beklediği JSON (yeni IBAN/ünvan vb.)
}): Promise<{ status: "success" | "error"; reason?: string }> {
  const cfg = getPayTRConfig()
  if (!cfg.configured) return { status: "error", reason: "PayTR yapılandırılmamış." }

  const token = buildResendHash({
    merchantId: cfg.merchantId,
    transId: p.transId,
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
  })
  const form = new URLSearchParams()
  form.append("merchant_id", cfg.merchantId)
  form.append("trans_id", p.transId)
  form.append("trans_info", JSON.stringify(p.transInfo))
  form.append("paytr_token", token)

  try {
    const res = await fetch(`${cfg.baseUrl}/odeme/hesaptan-gonder`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const json: any = await res.json().catch(() => ({}))
    if (json.status === "success") return { status: "success" }
    return { status: "error", reason: json.reason || json.err_msg || "Bilinmeyen hata" }
  } catch (e: any) {
    return { status: "error", reason: e?.message || "Ağ hatası" }
  }
}
