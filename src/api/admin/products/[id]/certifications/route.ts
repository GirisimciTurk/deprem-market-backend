import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

/**
 * Admin sertifika yönetimi. Satıcının aksine admin `verified` bayrağını serbestçe
 * ayarlayabilir — bu, bir sertifikanın belgeyle doğrulandığını işaretlemenin TEK
 * yetkili yoludur. Storefront yalnız `verified: true` olanları "Doğrulanmış" gösterir.
 *
 * GET  /admin/products/:id/certifications        → mevcut sertifikalar
 * POST /admin/products/:id/certifications        → tüm listeyi (verified dahil) yaz
 */
const schema = z.object({
  certifications: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        authority: z.string().max(80).optional().nullable(),
        document_url: z.string().url().optional().nullable(),
        verified: z.boolean().optional(),
      })
    )
    .max(15),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const product = await productModule.retrieveProduct(req.params.id).catch(() => null)
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })
  const certs = ((product.metadata as any)?.certifications as any[]) || []
  return res.json({ certifications: Array.isArray(certs) ? certs : [] })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz sertifika verisi.", issues: parsed.error.issues })
  }

  const productModule = req.scope.resolve(Modules.PRODUCT)
  const product = await productModule.retrieveProduct(req.params.id).catch(() => null)
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })

  // Admin GÜVENİLİR: verified değeri olduğu gibi yazılır (satıcı yolundan farkı bu).
  const seen = new Set<string>()
  const certifications = parsed.data.certifications
    .map((c) => {
      const label = c.label.trim()
      return {
        label,
        authority: c.authority?.trim() || null,
        document_url: c.document_url?.trim() || null,
        verified: c.verified === true,
      }
    })
    .filter((c) => {
      const k = c.label.toLowerCase()
      if (!c.label || seen.has(k)) return false
      seen.add(k)
      return true
    })

  const metadata = { ...((product.metadata as Record<string, unknown>) || {}) }
  if (certifications.length > 0) metadata.certifications = certifications
  else delete metadata.certifications

  await productModule.updateProducts(req.params.id, { metadata })

  // ISR tazeleme için ürün güncelleme olayını tetikle (revalidate subscriber dinler).
  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit({ name: "product.updated", data: { id: req.params.id } })
  } catch {
    /* olay yayını başarısız olsa da metadata yazıldı; ISR ≤30sn'de tazeler */
  }

  return res.json({ certifications })
}
