/**
 * Ürün sertifikaları (metadata.certifications) için güvenli birleştirme.
 *
 * GÜVENLİK KURALI: `verified` bayrağı ASLA satıcıdan kabul edilmez — yalnız admin
 * bir sertifikayı belgeyle doğrulayabilir. Satıcı formu yalnız beyan girer; bu
 * beyanlar storefront'ta "Üretici beyanı" olarak gösterilir. Bir sertifika ancak
 * admin doğrulama ucundan `verified: true` yapılınca "Doğrulanmış" rozeti alır.
 *
 * Güncellemede, ürünün MEVCUT metadata'sında admin tarafından doğrulanmış aynı
 * etiketli sertifikalar korunur (label eşleşmesi, büyük/küçük harf duyarsız) —
 * böylece satıcı düzenlemesi admin doğrulamasını sıfırlamaz.
 */
export type VendorCertificationInput = {
  label?: string | null
  authority?: string | null
  document_url?: string | null
}

export type StoredCertification = {
  label: string
  authority: string | null
  document_url: string | null
  verified: boolean
}

const MAX_CERTIFICATIONS = 15

export function sanitizeVendorCertifications(
  input: VendorCertificationInput[] | null | undefined,
  existingMeta?: Record<string, unknown> | null
): StoredCertification[] {
  const list = Array.isArray(input) ? input : []

  // Mevcut metadata'da admin tarafından doğrulanmış etiketler (korunacak).
  const verifiedLabels = new Set<string>()
  const existing = (existingMeta?.certifications as any[]) || []
  if (Array.isArray(existing)) {
    for (const c of existing) {
      if (c?.verified === true && typeof c?.label === "string") {
        verifiedLabels.add(c.label.trim().toLowerCase())
      }
    }
  }

  const seen = new Set<string>()
  const out: StoredCertification[] = []
  for (const c of list) {
    const label = typeof c?.label === "string" ? c.label.trim() : ""
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      label,
      authority:
        typeof c?.authority === "string" && c.authority.trim() ? c.authority.trim() : null,
      document_url:
        typeof c?.document_url === "string" && c.document_url.trim()
          ? c.document_url.trim()
          : null,
      // Satıcı doğrulayamaz; yalnız daha önce admin'in doğruladığı etiket korunur.
      verified: verifiedLabels.has(key),
    })
    if (out.length >= MAX_CERTIFICATIONS) break
  }
  return out
}
