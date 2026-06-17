import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveSeller } from "../../_lib/resolve-seller"
import { createVendorProduct } from "../../_lib/create-vendor-product"
import { getPendingRequiredContracts } from "../../../../lib/seller-contracts"
import { notifyAdmins } from "../../../../lib/notify"
import { vendorBulkLimiter, enforceRateLimit } from "../../../../lib/rate-limiter"

const MAX_ROWS = 500

/**
 * Toplu satır şeması. Zorunlu: title + price. Diğer tüm alanlar opsiyonel.
 * Sayılar z.coerce ile string'ten de kabul edilir (Excel hücreleri metin gelebilir).
 * images/tags virgül/satır ile ayrılmış tek hücre; brand/category AD ile gelir
 * (sunucuda id'ye çevrilir). Varyant ve kategori-özelliği toplu yüklemede yok.
 */
const rowSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  price: z.coerce.number().positive(),
  original_price: z.coerce.number().positive().optional(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  thumbnail: z.string().optional().nullable(),
  images: z.string().optional().nullable(), // "url1, url2" — ilki ana görsel
  weight: z.coerce.number().positive().optional(),
  length: z.coerce.number().positive().optional(),
  width: z.coerce.number().positive().optional(),
  height: z.coerce.number().positive().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  vat_rate: z.coerce.number().min(0).max(100).optional(),
  delivery_days: z.coerce.number().int().min(0).optional(),
  material: z.string().optional().nullable(),
  tags: z.string().optional().nullable(), // "etiket1, etiket2"
  brand: z.string().optional().nullable(), // marka ADI → onaylı listede aranır
  category: z.string().optional().nullable(), // kategori ADI → eşleştirilir
})

const bulkSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(MAX_ROWS),
})

/** "a, b; c\nd" → ["a","b","c","d"] (boşları ele). */
function splitList(value?: string | null): string[] {
  if (!value) return []
  return String(value)
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/**
 * POST /vendors/products/bulk  { rows: [...] }
 * Satıcının Excel/CSV'den parse edilmiş ürün satırlarını toplu yükler. Her satır
 * bağımsız doğrulanıp oluşturulur; bir satır hatalıysa diğerleri etkilenmez.
 *
 * Marka/kategori AD ile gelir; sunucuda (önceden tek seferde yüklenen) onaylı
 * marka ve kategori listesinden id'ye çevrilir. Bulunamazsa o alan atlanır ve
 * created satırına "warning" eklenir (ürün yine oluşturulur).
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

  // Marka + kategori adlarını id'ye çevirmek için tek seferlik sözlükler (satır
  // başına sorgu yapmamak için döngü öncesi yüklenir). Hata olursa boş geçer.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const brandByName = new Map<string, string>()
  const categoryByName = new Map<string, string>()
  try {
    const { data: brands } = await query.graph({
      entity: "brand",
      fields: ["id", "name", "status"],
    })
    for (const b of brands ?? []) {
      if ((b as any).status === "approved" && (b as any).name) {
        brandByName.set(String((b as any).name).trim().toLowerCase(), (b as any).id)
      }
    }
  } catch {
    /* marka modülü yoksa marka eşleştirme atlanır */
  }
  try {
    const { data: cats } = await query.graph({
      entity: "product_category",
      fields: ["id", "name"],
    })
    for (const c of cats ?? []) {
      if ((c as any).name) {
        categoryByName.set(String((c as any).name).trim().toLowerCase(), (c as any).id)
      }
    }
  } catch {
    /* kategori okunamazsa eşleştirme atlanır */
  }

  const created: { index: number; id: string; title: string; warning?: string }[] = []
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
    const r = rowParsed.data
    const warns: string[] = []

    // Marka adı → id (onaylı liste). Bulunamazsa markasız ekle, uyar.
    let brand_id: string | undefined
    let subtitle: string | undefined
    if (r.brand && r.brand.trim()) {
      const id = brandByName.get(r.brand.trim().toLowerCase())
      if (id) {
        brand_id = id
        subtitle = r.brand.trim()
      } else {
        warns.push(`marka '${r.brand.trim()}' onaylı listede yok (markasız eklendi)`)
      }
    }
    // Kategori adı → id. Bulunamazsa kategorisiz ekle, uyar.
    let category_ids: string[] | undefined
    if (r.category && r.category.trim()) {
      const id = categoryByName.get(r.category.trim().toLowerCase())
      if (id) category_ids = [id]
      else warns.push(`kategori '${r.category.trim()}' bulunamadı (kategorisiz eklendi)`)
    }

    const images = splitList(r.images)

    try {
      const product = await createVendorProduct(
        req.scope,
        resolved.seller.id,
        resolved.seller.handle,
        {
          title: r.title,
          description: r.description ?? undefined,
          price: r.price,
          original_price: r.original_price ?? undefined,
          sku: r.sku ?? undefined,
          barcode: r.barcode ?? undefined,
          thumbnail: r.thumbnail ?? undefined,
          images: images.length > 0 ? images : undefined,
          weight: r.weight ?? undefined,
          length: r.length ?? undefined,
          width: r.width ?? undefined,
          height: r.height ?? undefined,
          stock: r.stock ?? undefined,
          vat_rate: r.vat_rate ?? undefined,
          delivery_days: r.delivery_days ?? undefined,
          material: r.material ?? undefined,
          tags: splitList(r.tags),
          subtitle,
          brand_id,
          category_ids,
        },
        String(i + 1)
      )
      created.push({
        index: i,
        id: product.id,
        title: product.title,
        ...(warns.length ? { warning: warns.join("; ") } : {}),
      })
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
