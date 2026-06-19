/**
 * Türk vergi kimlik no doğrulaması — TAMAMEN OFFLINE (sağlama/checksum).
 *
 * - VKN (Vergi Kimlik No, tüzel kişi): 10 hane, resmî sağlama algoritması.
 * - TCKN (TC Kimlik No, gerçek kişi/şahıs şirketi): 11 hane, resmî sağlama algoritması.
 *
 * Bu kontrol numaranın MATEMATİKSEL olarak geçerli olduğunu söyler (sahte/typo
 * yakalar); numaranın gerçekten o işletmeye ait olduğunu DOĞRULAMAZ — onun için
 * GİB sorgusu (harici servis) gerekir. Başvuruyu engellemez, admin'e işaret verir.
 */
export type TaxIdType = "vkn" | "tckn" | null

export interface TaxIdResult {
  normalized: string
  valid: boolean
  type: TaxIdType
  reason: string
}

export function validateTaxId(raw: string | null | undefined): TaxIdResult {
  const normalized = (raw ?? "").replace(/\D/g, "")
  if (!normalized) {
    return { normalized, valid: false, type: null, reason: "Vergi/TC no girilmemiş" }
  }
  if (normalized.length === 10) {
    const ok = isValidVkn(normalized)
    return { normalized, valid: ok, type: "vkn", reason: ok ? "Geçerli VKN" : "VKN sağlama hatası" }
  }
  if (normalized.length === 11) {
    const ok = isValidTckn(normalized)
    return { normalized, valid: ok, type: "tckn", reason: ok ? "Geçerli TCKN" : "TCKN sağlama hatası" }
  }
  return {
    normalized,
    valid: false,
    type: null,
    reason: `Uzunluk hatalı (${normalized.length} hane) — VKN 10, TCKN 11 hane olmalı`,
  }
}

/** Vergi Kimlik No (10 hane) resmî sağlama algoritması. */
function isValidVkn(v: string): boolean {
  if (!/^\d{10}$/.test(v)) return false
  const d = v.split("").map(Number)
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let tmp = (d[i] + (9 - i)) % 10
    if (tmp !== 0) {
      tmp = (tmp * Math.pow(2, 9 - i)) % 9
      if (tmp === 0) tmp = 9
    }
    sum += tmp
  }
  const check = (10 - (sum % 10)) % 10
  return check === d[9]
}

/** TC Kimlik No (11 hane) resmî sağlama algoritması. */
function isValidTckn(v: string): boolean {
  if (!/^\d{11}$/.test(v)) return false
  const d = v.split("").map(Number)
  if (d[0] === 0) return false
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8]
  const evenSum = d[1] + d[3] + d[5] + d[7]
  const tenth = ((oddSum * 7 - evenSum) % 10 + 10) % 10
  if (tenth !== d[9]) return false
  const first10 = d.slice(0, 10).reduce((a, b) => a + b, 0)
  return first10 % 10 === d[10]
}
