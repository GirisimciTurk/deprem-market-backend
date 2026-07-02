import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
  createInventoryItemsWorkflow,
} from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { resolveSeller } from "../../_lib/resolve-seller"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { buildAttributeSpecs } from "../../../../lib/category-attributes"
import { sanitizeShowcaseKeys } from "../../../../lib/showcase-categories"

/** Ürünün bu satıcıya ait olup olmadığını doğrular. */
async function ownsProduct(req: MedusaRequest, productId: string, sellerId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "status",
      "metadata",
      "seller.id",
      "categories.id",
      "variants.id",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { id: productId },
  })
  const product = data?.[0] as any
  if (!product || product.seller?.id !== sellerId) return null
  return product
}

/** GET /vendors/products/:id — düzenleme formu için ürünün tüm detayları. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "subtitle", "description", "material", "thumbnail", "status",
      "weight", "length", "width", "height", "metadata",
      "images.url", "images.rank",
      "categories.id", "categories.name",
      "seller.id",
      "variants.id", "variants.title", "variants.sku", "variants.barcode",
      "variants.weight", "variants.length", "variants.width", "variants.height",
      "variants.metadata",
      "variants.prices.amount", "variants.prices.currency_code",
      "variants.options.value", "variants.options.option.title",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "options.id", "options.title", "options.values.value",
    ],
    filters: { id: req.params.id },
  })
  const product = data?.[0] as any
  if (!product || product.seller?.id !== resolved.seller.id) {
    return res.status(404).json({ message: "Ürün bulunamadı." })
  }

  // Varyantlara açılış stoğunu (lokasyon seviyeleri toplamı) ekle. Liste GET'iyle
  // tutarlı: seviye hiç yoksa null (henüz stoklanmamış), varsa toplam.
  for (const v of product.variants ?? []) {
    let qty = 0
    let hasLevel = false
    for (const ii of v.inventory_items ?? []) {
      for (const lvl of ii.inventory?.location_levels ?? []) {
        qty += Number(lvl.stocked_quantity ?? 0)
        hasLevel = true
      }
    }
    v.inventory_quantity = hasLevel ? qty : null
  }
  // Görselleri rank'a göre sırala (ilk = ana).
  if (Array.isArray(product.images)) {
    product.images.sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0))
  }

  return res.json({ product })
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  thumbnail: z.string().url().optional().nullable(),
  // Çoklu görsel — verilirse thumbnail + images birlikte güncellenir (ilk = ana).
  images: z.array(z.string().url()).max(12).optional(),
  category_ids: z.array(z.string()).max(10).optional(),
  showcase: z.array(z.string()).max(10).optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  content_blocks: z
    .array(z.object({ image: z.string().url().optional().nullable(), text: z.string().max(1200) }))
    .max(12)
    .optional(),
  // Marka / kategori özellikleri / KDV / termin → metadata'ya merge edilir.
  brand_id: z.string().optional().nullable(),
  attributes: z.record(z.string(), z.any()).optional().nullable(),
  vat_rate: z.number().min(0).max(100).optional().nullable(),
  delivery_days: z.coerce.number().int().min(0).max(60).optional().nullable(),
  // Hizmet verilebilir ürün (yerinde montaj/uygulama) → metadata.is_serviceable.
  is_serviceable: z.boolean().optional().nullable(),
  service_kind: z.string().optional().nullable(),
  service_description: z.string().max(500).optional().nullable(),
  price: z.number().positive().optional(),
  // İndirimsiz / liste fiyatı → metadata.compare_at_price (boş/0 ⇒ kaldırılır).
  original_price: z.number().nonnegative().optional().nullable(),
  weight: z.number().positive().optional(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  // Stok adedi — varsayılan lokasyondaki envanter seviyesi (yoksa açılır).
  stock: z.coerce.number().int().min(0).optional(),
  // --- Çok-varyant düzenleme (verilirse tek-varyant alanları yok sayılır) ---
  options: z
    .array(z.object({ title: z.string().min(1), values: z.array(z.string().min(1)).min(1) }))
    .optional(),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        price: z.number().positive(),
        original_price: z.number().positive().optional().nullable(),
        sku: z.string().optional().nullable(),
        barcode: z.string().optional().nullable(),
        stock: z.coerce.number().int().min(0).optional(),
        // Varyant bazında boyut/ağırlık (OPSİYONEL override; weight=gram, ölçüler=cm).
        weight: z.number().positive().optional().nullable(),
        length: z.number().positive().optional().nullable(),
        width: z.number().positive().optional().nullable(),
        height: z.number().positive().optional().nullable(),
        options: z.record(z.string(), z.string()),
      })
    )
    .optional(),
})

/** POST /vendors/products/:id — satıcı kendi ürününü günceller. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const product = await ownsProduct(req, req.params.id, resolved.seller.id)
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })

  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const data = parsed.data

  const update: Record<string, unknown> = { id: product.id }
  if (data.title !== undefined) update.title = data.title
  if (data.subtitle !== undefined) update.subtitle = data.subtitle
  if (data.description !== undefined) update.description = data.description
  if (data.material !== undefined) update.material = data.material
  if (data.weight !== undefined) update.weight = data.weight
  if (data.length !== undefined) update.length = data.length
  if (data.width !== undefined) update.width = data.width
  if (data.height !== undefined) update.height = data.height
  if (data.category_ids !== undefined) update.category_ids = data.category_ids

  // Görseller: çoklu galeri öncelikli; yoksa tekil thumbnail (geriye dönük).
  if (data.images !== undefined) {
    update.images = data.images.map((url) => ({ url }))
    update.thumbnail = data.images[0] ?? null
  } else if (data.thumbnail !== undefined) {
    update.thumbnail = data.thumbnail
    update.images = data.thumbnail ? [{ url: data.thumbnail }] : []
  }

  // metadata MERGE (mevcut alanları koru): etiketler + indirimsiz fiyat.
  const existingMeta = (product.metadata ?? {}) as Record<string, unknown>
  const metadata = { ...existingMeta }
  let metaChanged = false
  if (data.tags !== undefined) {
    if (data.tags.length > 0) metadata.tags = data.tags
    else delete metadata.tags
    metaChanged = true
  }
  if (data.original_price !== undefined) {
    if (data.original_price && data.original_price > 0) metadata.compare_at_price = data.original_price
    else delete metadata.compare_at_price
    metaChanged = true
  }
  if (data.showcase !== undefined) {
    const keys = sanitizeShowcaseKeys(data.showcase)
    if (keys.length > 0) metadata.showcase = keys
    else delete metadata.showcase
    metaChanged = true
  }
  if (data.content_blocks !== undefined) {
    const blocks = data.content_blocks
      .map((b) => ({ image: (b.image || "").trim() || null, text: (b.text || "").trim() }))
      .filter((b) => b.text || b.image)
    if (blocks.length > 0) metadata.content_blocks = blocks
    else delete metadata.content_blocks
    metaChanged = true
  }
  if (data.brand_id !== undefined) {
    if (data.brand_id) metadata.brand_id = data.brand_id
    else delete metadata.brand_id
    metaChanged = true
  }
  if (data.attributes !== undefined) {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data.attributes ?? {})) {
      if (v == null) continue
      if (typeof v === "string" && v.trim() === "") continue
      if (Array.isArray(v) && v.length === 0) continue
      cleaned[k] = v
    }
    if (Object.keys(cleaned).length > 0) {
      metadata.attributes = cleaned
      // Etiketli gösterim snapshot'ını yeniden üret (etkin kategori: yeni veya mevcut).
      const effectiveCat = data.category_ids?.[0] ?? (product as any).categories?.[0]?.id
      const specs = await buildAttributeSpecs(req.scope, effectiveCat, cleaned)
      if (specs.length > 0) metadata.specs = specs
      else delete metadata.specs
    } else {
      delete metadata.attributes
      delete metadata.specs
    }
    metaChanged = true
  }
  if (data.vat_rate !== undefined) {
    if (data.vat_rate != null) metadata.vat_rate = data.vat_rate
    else delete metadata.vat_rate
    metaChanged = true
  }
  if (data.delivery_days !== undefined) {
    if (data.delivery_days != null) metadata.delivery_days = data.delivery_days
    else delete metadata.delivery_days
    metaChanged = true
  }
  // Hizmet verilebilir ürün: işaretliyse yaz, kaldırıldıysa metadata'dan sil.
  if (data.is_serviceable !== undefined) {
    if (data.is_serviceable) {
      metadata.is_serviceable = true
      metadata.service_kind = data.service_kind || "other"
      const sd = (data.service_description || "").trim()
      if (sd) metadata.service_description = sd
      else delete metadata.service_description
    } else {
      delete metadata.is_serviceable
      delete metadata.service_kind
      delete metadata.service_description
    }
    metaChanged = true
  }
  if (metaChanged) update.metadata = metadata

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const isMulti = Array.isArray(data.variants) && data.variants.length > 0

  // Bir varyantın opsiyon eşlemesinden ("Beden=M|Renk=Kırmızı") kararlı anahtar.
  const optKey = (m: Record<string, string>) =>
    Object.entries(m || {})
      .map(([k, v]) => `${k.trim()}=${String(v).trim()}`)
      .sort()
      .join("|")

  if (isMulti) {
    // Mevcut varyantları opsiyon-kombinasyonuna göre eşle (id'leri al ki güncellensin,
    // yeniden oluşturulmasın). Eşleşmeyen gelen varyant yeni oluşturulur; payload'da
    // olmayan mevcut varyant updateProductsWorkflow tarafından silinir.
    const { data: ex } = await query.graph({
      entity: "product",
      fields: ["variants.id", "variants.options.value", "variants.options.option.title"],
      filters: { id: product.id },
    })
    const existingVariants: any[] = (ex?.[0] as any)?.variants ?? []
    const keyToId = new Map<string, string>()
    for (const ev of existingVariants) {
      const m: Record<string, string> = {}
      for (const o of ev.options ?? []) m[o.option?.title ?? ""] = o.value
      keyToId.set(optKey(m), ev.id)
    }

    update.options = (data.options ?? []).map((o) => ({ title: o.title.trim(), values: o.values }))
    update.variants = data.variants!.map((v) => {
      const id = v.id ?? keyToId.get(optKey(v.options))
      // Varyant bazında boyut override (verilenleri yaz; verilmeyen değişmez).
      const dims: Record<string, number | null> = {}
      if (v.weight !== undefined) dims.weight = v.weight ?? null
      if (v.length !== undefined) dims.length = v.length ?? null
      if (v.width !== undefined) dims.width = v.width ?? null
      if (v.height !== undefined) dims.height = v.height ?? null
      // Varyant indirimsiz fiyatı → varyant metadata.compare_at_price.
      let variantMeta: Record<string, unknown> | undefined
      if (v.original_price !== undefined) {
        variantMeta = {}
        if (v.original_price != null && v.original_price > v.price) {
          variantMeta.compare_at_price = v.original_price
        }
      }
      return {
        ...(id ? { id } : {}),
        title: v.title?.trim() || Object.values(v.options).join(" / "),
        options: v.options,
        sku: v.sku?.trim() || null,
        barcode: v.barcode?.trim() || null,
        prices: [{ amount: Math.round(v.price * 100), currency_code: "try" }],
        ...dims,
        ...(variantMeta ? { metadata: variantMeta } : {}),
      }
    })
  }

  await updateProductsWorkflow(req.scope).run({
    input: { products: [update as any] },
  })

  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const locationId = locations?.[0]?.id
  const inventory = req.scope.resolve(Modules.INVENTORY)

  /** Bir envanter kalemi için varsayılan lokasyonda stok seviyesini ayarlar (yoksa açar). */
  const setStock = async (invItemId: string, qty: number) => {
    if (!invItemId || !locationId) return
    const existing = await inventory.listInventoryLevels({
      inventory_item_id: invItemId,
      location_id: locationId,
    })
    if (existing.length > 0) {
      await inventory.updateInventoryLevels([
        { inventory_item_id: invItemId, location_id: locationId, stocked_quantity: qty },
      ])
    } else {
      await inventory.createInventoryLevels([
        { inventory_item_id: invItemId, location_id: locationId, stocked_quantity: qty },
      ])
    }
  }

  if (isMulti) {
    // Güncel varyantları (opsiyon + envanter kalemi) çekip her birinin stoğunu ayarla.
    const { data: after } = await query.graph({
      entity: "product",
      fields: [
        "variants.id",
        "variants.options.value",
        "variants.options.option.title",
        "variants.inventory_items.inventory_item_id",
      ],
      filters: { id: product.id },
    })
    const afterVariants: any[] = (after?.[0] as any)?.variants ?? []
    const stockByKey = new Map<string, number>()
    for (const v of data.variants!) {
      if (v.stock != null) stockByKey.set(optKey(v.options), v.stock)
    }
    const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
    for (const av of afterVariants) {
      const m: Record<string, string> = {}
      for (const o of av.options ?? []) m[o.option?.title ?? ""] = o.value
      const qty = stockByKey.get(optKey(m))
      if (qty == null) continue
      let invItemId = av.inventory_items?.[0]?.inventory_item_id
      // Yeni eklenen varyant (ör. yeni beden) envanter kalemine sahip olmayabilir —
      // updateProductsWorkflow bunu otomatik oluşturmaz. Yoksa oluşturup bağla.
      if (!invItemId) {
        const { result } = await createInventoryItemsWorkflow(req.scope).run({
          input: { items: [{ sku: av.sku || undefined, title: av.title || undefined }] },
        })
        invItemId = (result as any[])[0]?.id
        if (invItemId) {
          await link.create({
            [Modules.PRODUCT]: { variant_id: av.id },
            [Modules.INVENTORY]: { inventory_item_id: invItemId },
          })
        }
      }
      if (invItemId) await setStock(invItemId, qty)
    }
  } else {
    // Tek-varyant: ilk varyantın fiyat/SKU/barkod + stoğu.
    const variantId = product.variants?.[0]?.id
    if (variantId && (data.price !== undefined || data.sku !== undefined || data.barcode !== undefined)) {
      // Fiyat pricing modülü/price-set ile yönetilir → upsertProductVariants ile
      // `prices` güncellemek MikroORM'da "fieldNames undefined" ile 500 verir.
      // updateProductVariantsWorkflow prices'ı doğru işler (price_set döndürür).
      const variantUpdate: Record<string, unknown> = {}
      if (data.price !== undefined) {
        variantUpdate.prices = [{ amount: Math.round(data.price * 100), currency_code: "try" }]
      }
      if (data.sku !== undefined) variantUpdate.sku = data.sku || null
      if (data.barcode !== undefined) variantUpdate.barcode = data.barcode || null
      await updateProductVariantsWorkflow(req.scope).run({
        input: { selector: { id: variantId }, update: variantUpdate as any },
      })
    }
    if (data.stock !== undefined) {
      const invItemId = product.variants?.[0]?.inventory_items?.[0]?.inventory_item_id
      if (invItemId) await setStock(invItemId, data.stock)
    }
  }

  return res.json({ id: product.id, updated: true })
}

/** DELETE /vendors/products/:id — satıcı kendi ürününü siler. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const product = await ownsProduct(req, req.params.id, resolved.seller.id)
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })

  // Önce seller↔product link'ini kaldır (yoksa ürün silinince askıda link kalır →
  // /vendors/products & /vendors/stats null elemanda 500 verir). create-vendor-product
  // link'i link.create ile kuruyor; aynısını dismiss ile geri al.
  const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
  await link.dismiss({
    [MARKETPLACE_MODULE]: { seller_id: resolved.seller.id },
    [Modules.PRODUCT]: { product_id: product.id },
  })

  const productModule = req.scope.resolve(Modules.PRODUCT)
  await productModule.deleteProducts([product.id])
  return res.json({ id: product.id, object: "product", deleted: true })
}
