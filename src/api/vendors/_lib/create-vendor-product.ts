import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { buildAttributeSpecs } from "../../../lib/category-attributes"

function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "")
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "urun"
  )
}

/** Çok-varyantlı üründe tek bir varyant (kombinasyon). */
export type VendorVariantInput = {
  title: string
  /** Fiyat TRY, major birim — kuruşa çevrilir. */
  price: number
  sku?: string | null
  barcode?: string | null
  stock?: number | null
  /** Seçenek eşlemesi: { Beden: "M", Renk: "Kırmızı" } */
  options: Record<string, string>
}

export type VendorProductInput = {
  title: string
  description?: string | null
  /** Marka / kısa başlık (Medusa subtitle). */
  subtitle?: string | null
  /** Malzeme (örn: "Polyester", "Paslanmaz çelik"). */
  material?: string | null
  thumbnail?: string | null
  /** Görsel URL'leri — ilki ana görsel (thumbnail) olur. */
  images?: string[] | null
  /** Bağlanacak kategori id'leri. */
  category_ids?: string[] | null
  /** Etiketler (serbest metin). */
  tags?: string[] | null
  /** Detaylı anlatım blokları (foto + yazı). Ürün sayfasında sırayla render edilir. */
  content_blocks?: { image?: string | null; text: string }[] | null
  // --- Marka (onaylı Brand listesinden) ---
  /** Seçilen markanın id'si. metadata.brand_id'ye yazılır; subtitle marka adını taşır. */
  brand_id?: string | null
  // --- Kategori bazlı dinamik özellikler ({ key: value }) → metadata.attributes ---
  attributes?: Record<string, unknown> | null
  // --- KDV oranı (%) ve kargoya veriliş (termin) süresi (gün) ---
  vat_rate?: number | null
  delivery_days?: number | null
  // --- Kargo / boyut (kg & cm; desi storefront/kargo için) ---
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  // --- Tek-varyant modu (geriye dönük uyumlu) ---
  /** Fiyat TRY, major birim (ör. 199.90) — kuruşa çevrilir. */
  price?: number
  /** İndirimsiz / liste fiyatı (TRY major). Verilirse üstü çizili gösterim için metadata.compare_at_price'a yazılır. */
  original_price?: number | null
  sku?: string | null
  barcode?: string | null
  /** Açılış stoğu (adet). Verilirse varsayılan lokasyonda stok seviyesi açılır. */
  stock?: number | null
  // --- Durum: taslak mı onaya mı? (varsayılan proposed = onay bekliyor) ---
  status?: "draft" | "proposed"
  // --- Çok-varyant modu (options+variants verilirse öncelikli) ---
  options?: { title: string; values: string[] }[]
  variants?: VendorVariantInput[]
}

/**
 * Bir satıcı için tek bir ürün oluşturur (çift onay gereği "proposed" durumunda),
 * seller-product link'iyle satıcıya bağlar ve stok verildiyse varsayılan
 * lokasyonda envanter seviyesi açar. Hem tek-ürün ekleme (POST /vendors/products)
 * hem toplu yükleme (POST /vendors/products/bulk) bunu kullanır.
 *
 * benzersiz handle çakışmasını önlemek için handle'a satıcı handle'ı + ekisuffix
 * eklenir.
 */
export async function createVendorProduct(
  scope: any,
  sellerId: string,
  sellerHandle: string,
  input: VendorProductInput,
  handleSuffix?: string
) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const link = scope.resolve(ContainerRegistrationKeys.LINK)

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const shippingProfileId = profiles?.[0]?.id
  const salesChannelId = channels?.[0]?.id

  const base = slugify(input.title)
  const handle = `${base}-${sellerHandle}${handleSuffix ? `-${handleSuffix}` : ""}`

  // Çok-varyant modu: options + variants verildiyse onları kullan; aksi halde
  // tek-varyant ("Model: Standart") modu (geriye dönük uyumlu).
  const validOptions = (input.options ?? []).filter(
    (o) => o.title?.trim() && Array.isArray(o.values) && o.values.length > 0
  )
  const multi = validOptions.length > 0 && (input.variants?.length ?? 0) > 0

  let optionsPayload: { title: string; values: string[] }[]
  let variantsPayload: any[]
  // Varyant başlığı → açılış stoğu (create sonrası lokasyon seviyesi için).
  const stockByTitle: Record<string, number> = {}

  if (multi) {
    optionsPayload = validOptions.map((o) => ({ title: o.title.trim(), values: o.values }))
    variantsPayload = (input.variants ?? []).map((v) => {
      if (v.stock != null) stockByTitle[v.title] = Math.max(0, Math.floor(Number(v.stock)))
      return {
        title: v.title,
        sku: v.sku ?? undefined,
        barcode: v.barcode ?? undefined,
        options: v.options,
        manage_inventory: true,
        prices: [{ amount: Math.round(v.price * 100), currency_code: "try" }],
      }
    })
  } else {
    optionsPayload = [{ title: "Model", values: ["Standart"] }]
    variantsPayload = [
      {
        title: "Standart",
        sku: input.sku ?? undefined,
        barcode: input.barcode ?? undefined,
        options: { Model: "Standart" },
        manage_inventory: true,
        prices: [{ amount: Math.round(Number(input.price) * 100), currency_code: "try" }],
      },
    ]
    if (input.stock != null) stockByTitle["Standart"] = Math.max(0, Math.floor(Number(input.stock)))
  }

  // Görseller: çoklu galeri öncelikli; yoksa tekil thumbnail'a düş. İlk görsel
  // ana görsel (thumbnail) kabul edilir.
  const imageUrls = (input.images ?? []).map((u) => (u || "").trim()).filter(Boolean)
  if (imageUrls.length === 0 && input.thumbnail) imageUrls.push(input.thumbnail)
  const thumbnail = imageUrls[0]

  const categoryIds = (input.category_ids ?? []).filter(Boolean)
  const tagValues = (input.tags ?? []).map((t) => (t || "").trim()).filter(Boolean)

  // İndirimli fiyat gösterimi: liste fiyatı satış fiyatından büyükse üstü çizili
  // göstermek için metadata.compare_at_price'a (TRY major) yazılır.
  const sellPrice = input.price != null ? Number(input.price) : undefined
  const metadata: Record<string, unknown> = {}
  if (input.original_price != null && sellPrice != null && Number(input.original_price) > sellPrice) {
    metadata.compare_at_price = Number(input.original_price)
  }
  // Etiketler: Medusa native tag entity'si ayrı upsert gerektirir; veriyi
  // kaybetmemek için metadata.tags'e (string dizisi) yazıyoruz.
  if (tagValues.length > 0) metadata.tags = tagValues

  // Detaylı anlatım blokları (foto + yazı) — ürün sayfasında sırayla gösterilir.
  const blocks = (input.content_blocks ?? [])
    .map((b) => ({ image: (b.image || "").trim() || null, text: (b.text || "").trim() }))
    .filter((b) => b.text || b.image)
  if (blocks.length > 0) metadata.content_blocks = blocks

  // Marka kimliği (subtitle marka ADInı taşır; metadata.brand_id eşleştirme için).
  if (input.brand_id) metadata.brand_id = input.brand_id
  // Kategori bazlı dinamik özellikler — boş/null değerleri ele, kalanı sakla.
  if (input.attributes && typeof input.attributes === "object") {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input.attributes)) {
      if (v == null) continue
      if (typeof v === "string" && v.trim() === "") continue
      if (Array.isArray(v) && v.length === 0) continue
      cleaned[k] = v
    }
    if (Object.keys(cleaned).length > 0) {
      metadata.attributes = cleaned
      // Gösterim snapshot'ı (etiketli) — storefront doğrudan render eder.
      const specs = await buildAttributeSpecs(scope, categoryIds[0], cleaned)
      if (specs.length > 0) metadata.specs = specs
    }
  }
  // KDV oranı (%) ve kargoya veriliş (termin) süresi (gün).
  if (input.vat_rate != null && !Number.isNaN(Number(input.vat_rate))) {
    metadata.vat_rate = Number(input.vat_rate)
  }
  if (input.delivery_days != null && !Number.isNaN(Number(input.delivery_days))) {
    metadata.delivery_days = Math.max(0, Math.floor(Number(input.delivery_days)))
  }

  const { result } = await createProductsWorkflow(scope).run({
    input: {
      products: [
        {
          title: input.title,
          subtitle: input.subtitle ?? undefined,
          description: input.description ?? undefined,
          material: input.material ?? undefined,
          handle,
          status: (input.status ?? "proposed") as any,
          thumbnail: thumbnail ?? undefined,
          images: imageUrls.length > 0 ? imageUrls.map((url) => ({ url })) : undefined,
          weight: input.weight ?? undefined,
          length: input.length ?? undefined,
          width: input.width ?? undefined,
          height: input.height ?? undefined,
          category_ids: categoryIds.length > 0 ? categoryIds : undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          shipping_profile_id: shippingProfileId,
          options: optionsPayload,
          variants: variantsPayload,
          sales_channels: salesChannelId ? [{ id: salesChannelId }] : [],
        },
      ],
    },
  })

  const product = (result as any[])[0]

  // Ürünü satıcıya bağla (seller-product link).
  await link.create({
    [MARKETPLACE_MODULE]: { seller_id: sellerId },
    [Modules.PRODUCT]: { product_id: product.id },
  })

  // Açılış stoğu verilen varyantlar için varsayılan lokasyonda envanter seviyesi
  // aç. Varyantları BAŞLIĞA göre eşleştiririz (create envanter kalemini açar,
  // miktarı açmaz). Çok-varyantta her varyantın kendi stoğu olabilir.
  if (Object.keys(stockByTitle).length > 0) {
    const { data: created } = await query.graph({
      entity: "product",
      fields: ["id", "variants.title", "variants.inventory_items.inventory_item_id"],
      filters: { id: product.id },
    })
    const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
    const locationId = locations?.[0]?.id
    const variants = ((created?.[0] as any)?.variants ?? []) as any[]
    const levels: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
    if (locationId) {
      for (const v of variants) {
        const qty = stockByTitle[v.title]
        const invItemId = v.inventory_items?.[0]?.inventory_item_id
        if (qty != null && invItemId) {
          levels.push({ inventory_item_id: invItemId, location_id: locationId, stocked_quantity: qty })
        }
      }
    }
    if (levels.length > 0) {
      await createInventoryLevelsWorkflow(scope).run({ input: { inventory_levels: levels } })
    }
  }

  return product
}
