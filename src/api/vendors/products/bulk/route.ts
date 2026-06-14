import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../../_lib/resolve-seller"
import { createVendorProduct } from "../../_lib/create-vendor-product"
import { getPendingRequiredContracts } from "../../../../lib/seller-contracts"
import { notifyAdmins } from "../../../../lib/notify"
import { vendorBulkLimiter, enforceRateLimit } from "../../../../lib/rate-limiter"

const MAX_ROWS = 500

const rowSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  price: z.coerce.number().positive(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  thumbnail: z.string().url().optional().nullable(),
  weight: z.coerce.number().positive().optional(),
  stock: z.coerce.number().int().min(0).optional(),
})

const bulkSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(MAX_ROWS),
})

/**
 * POST /vendors/products/bulk  { rows: [...] }
 * Satıcının Excel/CSV'den parse edilmiş ürün satırlarını toplu yükler. Her satır
 * bağımsız doğrulanıp oluşturulur; bir satır hatalıysa diğerleri etkilenmez.
 * Dönen rapor: { created: [...], errors: [{ index, title, message }], total }.
 *
 * Dosya parse (xlsx/csv) istemci (vendor paneli) tarafında yapılır; bu uç saf JSON
 * satır dizisi alır. Yalnız aktif satıcılar kullanabilir. En fazla 500 satır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(vendorBulkLimiter, req, res)) return
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (resolved.seller.status !== "active") {
    return res.status(403).json({ message: "Yalnızca onaylı (aktif) satıcılar ürün ekleyebilir." })
  }
  const pending = await getPendingRequiredContracts(req.scope, resolved.seller.id)
  if (pending.length > 0) {
    return res.status(403).json({
      message: "Ürün ekleyebilmek için önce satıcı sözleşmelerini onaylamalısınız.",
      pending_contracts: pending.map((c) => ({ id: c.id, title: c.title })),
    })
  }

  const parsed = bulkSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: `Geçersiz veri (en fazla ${MAX_ROWS} satır).`, issues: parsed.error.issues })
  }

  const created: { index: number; id: string; title: string }[] = []
  const errors: { index: number; title: string; message: string }[] = []

  // Satırları sırayla işle — Medusa workflow'larının paralel koşması ve handle
  // çakışmaları riskli; ölçek 500 satırla sınırlı, sıralı işlem yeterli.
  for (let i = 0; i < parsed.data.rows.length; i++) {
    const raw = parsed.data.rows[i] as any
    const rowTitle = (raw?.title ?? "").toString().trim() || `Satır ${i + 1}`
    const rowParsed = rowSchema.safeParse(raw)
    if (!rowParsed.success) {
      const first = rowParsed.error.issues[0]
      errors.push({
        index: i,
        title: rowTitle,
        message: first ? `${first.path.join(".")}: ${first.message}` : "Geçersiz satır.",
      })
      continue
    }
    try {
      const product = await createVendorProduct(
        req.scope,
        resolved.seller.id,
        resolved.seller.handle,
        rowParsed.data,
        String(i + 1)
      )
      created.push({ index: i, id: product.id, title: product.title })
    } catch (e: any) {
      errors.push({ index: i, title: rowTitle, message: e?.message || "Ürün oluşturulamadı." })
    }
  }

  // Oluşturulan ürünler için admin'e TEK özet bildirim (satır başına spam yapma).
  if (created.length > 0) {
    await notifyAdmins(req.scope, {
      type: "product_approval",
      title: "Yayın bekleyen yeni ürünler",
      body: `${resolved.seller.name}: ${created.length} ürün toplu yüklendi, onay bekliyor.`,
      link: "/product-approvals",
    })
  }

  return res.status(created.length ? 201 : 400).json({
    created,
    errors,
    total: parsed.data.rows.length,
    created_count: created.length,
    error_count: errors.length,
  })
}
