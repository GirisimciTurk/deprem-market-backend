import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"
import { createVendorProduct } from "../_lib/create-vendor-product"
import { getPendingRequiredContracts } from "../../../lib/seller-contracts"
import { notifyAdmins } from "../../../lib/notify"

/** GET /vendors/products?status=&q=&limit=&offset= — satıcının kendi ürünleri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Linked modül alanıyla (seller.id) DOĞRUDAN filtreleme query.graph'ta
  // desteklenmiyor; satıcı→ürün yönünden ürün id'lerini alıp ürünleri bu
  // id'lerle (core filtre) sorgularız.
  const { data: sellerRows } = await query.graph({
    entity: "seller",
    fields: ["products.id"],
    filters: { id: resolved.seller.id },
  })
  // filter(Boolean): silinmiş ürüne işaret eden askıda link query.graph'ta null
  // eleman döndürür → map'ten önce ayıkla (yoksa 500).
  const productIds = ((sellerRows[0] as any)?.products ?? [])
    .filter(Boolean)
    .map((p: any) => p.id)
  if (productIds.length === 0) {
    return res.json({ products: [], count: 0, offset, limit })
  }

  const filters: Record<string, unknown> = { id: productIds }
  if (status) filters.status = status
  if (q) filters.title = { $ilike: `%${q}%` }

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "thumbnail",
      "handle",
      "created_at",
      "variants.id",
      "variants.sku",
      "variants.barcode",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    filters,
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })

  // Stok: `inventory_quantity` computed alanı sales-channel bağlamı gerektirdiği için
  // satıcı sorgusunda null dönebiliyor → her varyantın inventory_items'larındaki
  // location_levels.stocked_quantity'lerini toplayıp inventory_quantity'yi DOLDURUYORUZ.
  for (const p of products as any[]) {
    for (const v of p.variants ?? []) {
      let total = 0
      let hasLevel = false
      for (const ii of v.inventory_items ?? []) {
        for (const lvl of ii.inventory?.location_levels ?? []) {
          total += Number(lvl.stocked_quantity ?? 0)
          hasLevel = true
        }
      }
      v.inventory_quantity = hasLevel ? total : null
    }
  }

  return res.json({ products, count: metadata?.count ?? products.length, offset, limit })
}

const variantSchema = z.object({
  title: z.string().min(1),
  price: z.number().positive(),
  // İndirimsiz / liste fiyatı (varyant bazında üstü çizili gösterim).
  original_price: z.number().positive().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  stock: z.number().int().min(0).optional(),
  // Varyant bazında boyut/ağırlık (OPSİYONEL override; weight=gram, ölçüler=cm).
  weight: z.number().positive().optional().nullable(),
  length: z.number().positive().optional().nullable(),
  width: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  options: z.record(z.string(), z.string()),
})

const createSchema = z
  .object({
    title: z.string().min(1),
    subtitle: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    material: z.string().optional().nullable(),
    // Fiyat TRY, major birim (ör. 199.90) — kuruşa çevrilir. Tek-varyantta zorunlu.
    price: z.number().positive().optional(),
    // İndirimsiz / liste fiyatı (üstü çizili gösterim). Satış fiyatından büyükse anlamlı.
    original_price: z.number().positive().optional().nullable(),
    sku: z.string().optional().nullable(),
    barcode: z.string().optional().nullable(),
    // Görseller: çoklu galeri (ilk = ana görsel). thumbnail geriye dönük uyumluluk için korunur.
    thumbnail: z.string().url().optional().nullable(),
    images: z.array(z.string().url()).max(12).optional(),
    category_ids: z.array(z.string()).max(10).optional(),
    // Sabit vitrin kategorileri (çoklu). Geçersiz key'ler backend'de süzülür.
    showcase: z.array(z.string()).max(10).optional(),
    tags: z.array(z.string().min(1)).max(20).optional(),
    // Detaylı anlatım blokları (foto + yazı) — ürün sayfasında sırayla gösterilir.
    content_blocks: z
      .array(z.object({ image: z.string().url().optional().nullable(), text: z.string().max(1200) }))
      .max(12)
      .optional(),
    // Kargo / boyut (kg & cm).
    weight: z.number().positive().optional(),
    length: z.number().positive().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    stock: z.number().int().min(0).optional(),
    // "draft" = taslak (onaya gitmez), "proposed" = onaya gönder (varsayılan).
    status: z.enum(["draft", "proposed"]).optional(),
    // Marka (onaylı Brand id'si), kategori bazlı dinamik özellikler, KDV oranı, termin (gün).
    brand_id: z.string().optional().nullable(),
    attributes: z.record(z.string(), z.any()).optional().nullable(),
    vat_rate: z.number().min(0).max(100).optional().nullable(),
    delivery_days: z.coerce.number().int().min(0).max(60).optional().nullable(),
    // Hizmet verilebilir ürün (yerinde montaj/uygulama) → metadata.is_serviceable.
    is_serviceable: z.boolean().optional().nullable(),
    service_kind: z.string().optional().nullable(),
    service_description: z.string().max(500).optional().nullable(),
    // Çok-varyant modu: ikisi de verilirse matris ürünü oluşturulur.
    options: z.array(z.object({ title: z.string().min(1), values: z.array(z.string().min(1)).min(1) })).optional(),
    variants: z.array(variantSchema).optional(),
  })
  .refine(
    (d) => (d.variants && d.variants.length > 0 && d.options && d.options.length > 0) || d.price != null,
    { message: "Tek-varyantta fiyat, çok-varyantta options+variants gereklidir." }
  )

/**
 * POST /vendors/products — satıcı yeni ürün ekler. Çift onay gereği ürün
 * "proposed" durumunda oluşturulur (admin onaylayınca "published"). Yalnız aktif
 * satıcılar ürün ekleyebilir. Ürün, seller-product link'i ile satıcıya bağlanır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
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

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz ürün verisi.", issues: parsed.error.issues })
  }
  const data = parsed.data

  const product = await createVendorProduct(
    req.scope,
    resolved.seller.id,
    resolved.seller.handle,
    data
  )

  // Admin kontrol merkezine "yayın bekleyen ürün" bildirimi.
  await notifyAdmins(req.scope, {
    type: "product_approval",
    title: "Yayın bekleyen yeni ürün",
    body: `${resolved.seller.name}: ${data.title}`,
    link: "/product-approvals",
  })

  return res.status(201).json({ product })
}
