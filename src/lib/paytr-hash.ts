import { createHmac } from "crypto"

/**
 * PayTR imza (paytr_token / hash) formülleri — TEK kaynak.
 *
 * Bu fonksiyonlar para akışının güvenliğini belirler: yanlış imza ödeme/transfer/
 * iade isteğinin PayTR tarafından reddedilmesine yol açar. Formüller burada
 * merkezîleştirilir ve paytr-hash.unit.spec.ts ile bilinen girdi→çıktı eşlemesiyle
 * KİLİTLENİR (regresyon koruması).
 *
 * PayTR genel kuralı (callback HARİÇ):
 *   token = base64( HMAC-SHA256( <gövde> + merchant_salt, merchant_key ) )
 * Resmî PayTR Postman koleksiyonundan doğrulanmış gövde sıralamaları aşağıda.
 */

/** base64( HMAC-SHA256( body + salt, key ) ) — PayTR'ın standart token deseni. */
function tokenWithSalt(
  body: string,
  merchantKey: string,
  merchantSalt: string
): string {
  return createHmac("sha256", merchantKey)
    .update(body + merchantSalt)
    .digest("base64")
}

/**
 * get-token (iFrame) imzası.
 * Gövde: merchant_id + user_ip + merchant_oid + email + payment_amount +
 *        user_basket + no_installment + max_installment + currency + test_mode
 */
export function buildGetTokenHash(p: {
  merchantId: string
  userIp: string
  merchantOid: string
  email: string
  paymentAmount: string | number
  userBasket: string // base64'lenmiş sepet JSON'ı
  noInstallment: string | number
  maxInstallment: string | number
  currency: string
  testMode: string | number
  merchantKey: string
  merchantSalt: string
}): string {
  const body =
    `${p.merchantId}${p.userIp}${p.merchantOid}${p.email}${p.paymentAmount}` +
    `${p.userBasket}${p.noInstallment}${p.maxInstallment}${p.currency}${p.testMode}`
  return tokenWithSalt(body, p.merchantKey, p.merchantSalt)
}

/**
 * Callback (bildirim) imzası — DİKKAT: salt gövdenin İÇİNDE (oid'den sonra), sona
 * eklenmez. Gövde: merchant_oid + merchant_salt + status + total_amount
 */
export function buildCallbackHash(p: {
  merchantOid: string
  status: string
  totalAmount: string | number
  merchantKey: string
  merchantSalt: string
}): string {
  const body = `${p.merchantOid}${p.merchantSalt}${p.status}${p.totalAmount}`
  return createHmac("sha256", p.merchantKey).update(body).digest("base64")
}

/**
 * Platform Transfer (alt üye işyerine/IBAN'a para aktarma) imzası.
 * Gövde: merchant_id + merchant_oid + trans_id + submerchant_amount +
 *        total_amount + transfer_name + transfer_iban
 */
export function buildTransferHash(p: {
  merchantId: string
  merchantOid: string
  transId: string
  submerchantAmount: string | number // kuruş ×100 (PayTR isteği)
  totalAmount: string | number
  transferName: string
  transferIban: string
  merchantKey: string
  merchantSalt: string
}): string {
  const body =
    `${p.merchantId}${p.merchantOid}${p.transId}${p.submerchantAmount}` +
    `${p.totalAmount}${p.transferName}${p.transferIban}`
  return tokenWithSalt(body, p.merchantKey, p.merchantSalt)
}

/**
 * İade (refund) imzası.
 * Gövde: merchant_id + merchant_oid + return_amount
 */
export function buildRefundHash(p: {
  merchantId: string
  merchantOid: string
  returnAmount: string | number
  merchantKey: string
  merchantSalt: string
}): string {
  const body = `${p.merchantId}${p.merchantOid}${p.returnAmount}`
  return tokenWithSalt(body, p.merchantKey, p.merchantSalt)
}

/**
 * Geri dönen transfer listesi imzası.
 * Gövde: merchant_id + start_date + end_date
 */
export function buildReturnedTransfersHash(p: {
  merchantId: string
  startDate: string
  endDate: string
  merchantKey: string
  merchantSalt: string
}): string {
  const body = `${p.merchantId}${p.startDate}${p.endDate}`
  return tokenWithSalt(body, p.merchantKey, p.merchantSalt)
}

/**
 * Geri dönen ödemeyi hesaptan yeniden gönderme imzası.
 * Gövde: merchant_id + trans_id
 */
export function buildResendHash(p: {
  merchantId: string
  transId: string
  merchantKey: string
  merchantSalt: string
}): string {
  const body = `${p.merchantId}${p.transId}`
  return tokenWithSalt(body, p.merchantKey, p.merchantSalt)
}
