import { createHash } from "crypto"

/**
 * Paynkolay imza (hash) formülleri — TEK kaynak.
 *
 * Bu fonksiyonlar para akışının güvenliğini belirler: yanlış bir imza ödeme/iade
 * isteğinin banka tarafından reddedilmesine veya (kötü durumda) sahte isteklere yol
 * açar. Bu yüzden formüller burada merkezileştirilir ve paynkolay-hash.spec.ts ile
 * bilinen girdi→çıktı eşlemesiyle KİLİTLENİR (regresyon koruması). Route ve payment
 * provider bu fonksiyonları kullanır; inline kopya bırakılmaz.
 *
 * Tüm hash'ler: SHA-512(raw, utf-8) → base64.
 */

export function sha512Base64(raw: string): string {
  return createHash("sha512").update(raw, "utf-8").digest("base64")
}

/**
 * 04-hash-request (ödeme başlatma) imzası.
 * Format: sx|clientRefCode|amount|successUrl|failUrl|rnd|customerKey|merchantSecretKey
 * Not: kart saklama kullanılmıyorsa customerKey BOŞ ("...|rnd||secret").
 */
export function buildInitRequestHash(p: {
  sx: string
  clientRefCode: string
  amount: string
  successUrl: string
  failUrl: string
  rnd: string
  customerKey: string
  secretKey: string
}): string {
  const raw = `${p.sx}|${p.clientRefCode}|${p.amount}|${p.successUrl}|${p.failUrl}|${p.rnd}|${p.customerKey}|${p.secretKey}`
  return sha512Base64(raw)
}

/**
 * İptal/İade (CancelRefundPayment) imzası.
 * Format: sx|referenceCode|type|amount|trxDate|merchantSecretKey
 * type: "refund" (iade) veya "cancel" (iptal). trxDate: yyyy.MM.dd
 */
export function buildCancelRefundHash(p: {
  sx: string
  referenceCode: string
  type: "refund" | "cancel"
  amount: string
  trxDate: string
  secretKey: string
}): string {
  const raw = `${p.sx}|${p.referenceCode}|${p.type}|${p.amount}|${p.trxDate}|${p.secretKey}`
  return sha512Base64(raw)
}
