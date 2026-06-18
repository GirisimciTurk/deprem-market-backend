import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveSeller } from "../../_lib/resolve-seller"
import { createVendorProduct } from "../../_lib/create-vendor-product"
import { updateVendorProduct } from "../../_lib/update-vendor-product"
import { getPendingRequiredContracts } from "../../../../lib/seller-contracts"
import { notifyAdmins } from "../../../../lib/notify"
import { vendorBulkLimiter, enforceRateLimit } from "../../../../lib/rate-limiter"

const MAX_ROWS = 500

/**
 * Toplu satır şeması. Zorunlu: title + price. Diğer tüm alanlar opsiyonel.
 * Sayılar z.coerce ile string'ten de kabul edilir (Excel hücreleri metin gelebilir).
 * images/tags virgül/satır ile ayrılmış tek hücre; brand/category AD ile gelir
 * (sunucuda id'ye çevrilir).
 *
 * Varyant desteği: beden ve/veya renk alanı doluysa, aynı başlığa sahip
 * satırlar tek bir ürünün farklı varyantları olarak gruplanır.
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
  beden: z.string().optional().nullable(), // varyant opsiyon: Beden (S, M, L...)
  renk: z.string().optional().nullable(), // varyant opsiyon: Renk
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

// İç tip: parse edilmiş tek satır + orijinal indeks.
type ParsedRow = z.infer<typeof rowSchema> & { _index: number }

/**
 * Varyant bilgisi olan satırları (beden/renk) aynı başlığa göre gruplar.
 * Döndürülen yapıda:
 *   - singles: varyant bilgisi olmayan bağımsız satırlar
 *   - groups: aynı başlığa sahip varyantlı satır grupları
 */
function groupVariantRows(rows: ParsedRow[]): {
  singles: ParsedRow[]
  groups: Map<string, ParsedRow[]>
} {
  const singles: ParsedRow[] = []
  const grouped = new Map<string, ParsedRow[]>()

  for (const row of rows) {
    const hasBeden = !!(row.beden && row.beden.trim())
    const hasRenk = !!(row.renk && row.renk.trim())
    if (!hasBeden && !hasRenk) {
      singles.push(row)
    } else {
      const key = row.title.trim().toLowerCase()
      const existing = grouped.get(key) ?? []
      existing.push(row)
      grouped.set(key, existing)
    }
  }

  return { singles, groups: grouped }
}

/**
 * POST /vendors/products/bulk  { rows: [...] }
 * Satıcının Excel/CSV'den parse edilmiş ürün satırlarını toplu yükler. Her satır
 * bağımsız doğrulanıp oluşturulur; bir satır hatalıysa diğerleri etkilenmez.
 *
 * Varyant desteği: Beden ve/veya Renk kolonu dolu satırlar, aynı başlığa göre
 * gruplanarak tek bir ürünün farklı varyantları olarak oluşturulur. Her varyantın
 * kendi fiyatı, stoğu, SKU'su ve barkodu olur. Açıklama, görsel, marka gibi genel
 * alanlar grubun ilk satırından alınır.
 *
 * Marka/kategori AD ile gelir; sunucuda onaylı listeden id'ye çevrilir.
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

  // Satıcının mevcut ürünleri: variant SKU → {ürün, varyant, envanter, metadata}.
  // "SKU varsa güncelle, yoksa ekle" için döngü ÖNCESİ tek seferde yüklenir.
  const skuMap = new Map<
    string,
    { productId: string; variantId?: string | null; invItemId?: string | null; metadata?: Record<string, unknown> | null }
  >()
  try {
    const { data: sellerRows } = await query.graph({
      entity: "seller",
      fields: ["products.id"],
      filters: { id: resolved.seller.id },
    })
    const productIds = ((sellerRows[0] as any)?.products ?? [])
      .filter(Boolean)
      .map((p: any) => p.id)
    if (productIds.length > 0) {
      const { data: prods } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "metadata",
          "variants.id",
          "variants.sku",
          "variants.inventory_items.inventory_item_id",
        ],
        filters: { id: productIds },
      })
      for (const p of prods ?? []) {
        for (const v of (p as any).variants ?? []) {
          if (v?.sku) {
            skuMap.set(String(v.sku).trim().toLowerCase(), {
              productId: (p as any).id,
              variantId: v.id,
              invItemId: v.inventory_items?.[0]?.inventory_item_id ?? null,
              metadata: (p as any).metadata ?? {},
            })
          }
        }
      }
    }
  } catch {
    /* mevcut ürünler okunamazsa upsert devre dışı kalır; her satır yeni eklenir */
  }

  type ResultItem = { index: number; id: string; title: string; warning?: string }
  const created: ResultItem[] = []
  const updated: ResultItem[] = []
  const errors: { index: number; title: string; message: string }[] = []
  // Aynı dosyada tekrarlanan SKU'yu engellemek için bu çalıştırmada işlenenler.
  const processedSkus = new Set<string>()

  // Yardımcı: marka/kategori çözümleme
  function resolveBrandCategory(r: ParsedRow) {
    const warns: string[] = []
    let brand_id: string | undefined
    let subtitle: string | undefined
    if (r.brand && r.brand.trim()) {
      const id = brandByName.get(r.brand.trim().toLowerCase())
      if (id) { brand_id = id; subtitle = r.brand.trim() }
      else warns.push(`marka '${r.brand.trim()}' onaylı listede yok (markasız eklendi)`)
    }
    let category_ids: string[] | undefined
    if (r.category && r.category.trim()) {
      const id = categoryByName.get(r.category.trim().toLowerCase())
      if (id) category_ids = [id]
      else warns.push(`kategori '${r.category.trim()}' bulunamadı (kategorisiz eklendi)`)
    }
    return { brand_id, subtitle, category_ids, warns }
  }

  // ─── Satırları parse et ve varyant gruplarına ayır ───
  const parsedRows: ParsedRow[] = []
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
    parsedRows.push({ ...rowParsed.data, _index: i })
  }

  const { singles, groups } = groupVariantRows(parsedRows)

  // ─── 1) Tek-varyant (bağımsız) satırları işle (mevcut mantık) ───
  for (const r of singles) {
    const { brand_id, subtitle, category_ids, warns } = resolveBrandCategory(r)
    const images = splitList(r.images)
    const skuKey = r.sku ? String(r.sku).trim().toLowerCase() : ""

    if (skuKey && processedSkus.has(skuKey)) {
      errors.push({ index: r._index, title: r.title, message: `SKU '${r.sku}' bu dosyada tekrarlanıyor (atlandı).` })
      continue
    }
    const existing = skuKey ? skuMap.get(skuKey) : undefined

    try {
      if (existing) {
        await updateVendorProduct(req.scope, existing, {
          title: r.title,
          description: r.description ?? undefined,
          price: r.price,
          original_price: r.original_price ?? undefined,
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
        })
        updated.push({
          index: r._index,
          id: existing.productId,
          title: r.title,
          ...(warns.length ? { warning: warns.join("; ") } : {}),
        })
      } else {
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
          String(r._index + 1)
        )
        created.push({
          index: r._index,
          id: product.id,
          title: product.title,
          ...(warns.length ? { warning: warns.join("; ") } : {}),
        })
      }
      if (skuKey) processedSkus.add(skuKey)
    } catch (e: any) {
      errors.push({
        index: r._index,
        title: r.title,
        message: e?.message || (existing ? "Ürün güncellenemedi." : "Ürün oluşturulamadı."),
      })
    }
  }

  // ─── 2) Varyantlı grupları işle ───
  // Her grup = aynı başlık + beden/renk kombinasyonları → tek ürün, çoklu varyant.
  for (const [, groupRows] of groups) {
    const first = groupRows[0]
    const groupIndices = groupRows.map((r) => r._index)
    const { brand_id, subtitle, category_ids, warns } = resolveBrandCategory(first)

    // Seçenek (option) türlerini belirle: Beden var mı? Renk var mı?
    const hasBeden = groupRows.some((r) => r.beden && r.beden.trim())
    const hasRenk = groupRows.some((r) => r.renk && r.renk.trim())

    // Benzersiz değerleri topla (sıralı)
    const bedenValues: string[] = []
    const renkValues: string[] = []
    for (const r of groupRows) {
      if (r.beden && r.beden.trim() && !bedenValues.includes(r.beden.trim())) bedenValues.push(r.beden.trim())
      if (r.renk && r.renk.trim() && !renkValues.includes(r.renk.trim())) renkValues.push(r.renk.trim())
    }

    const options: { title: string; values: string[] }[] = []
    if (hasBeden) options.push({ title: "Beden", values: bedenValues })
    if (hasRenk) options.push({ title: "Renk", values: renkValues })

    // Her satır = bir varyant
    const variants = groupRows.map((r) => {
      const optionMap: Record<string, string> = {}
      if (hasBeden) optionMap["Beden"] = (r.beden && r.beden.trim()) || bedenValues[0]
      if (hasRenk) optionMap["Renk"] = (r.renk && r.renk.trim()) || renkValues[0]

      // Varyant başlığı: "S / Kırmızı" veya sadece "M"
      const label = Object.values(optionMap).join(" / ")

      return {
        title: label,
        price: r.price,
        original_price: r.original_price ?? undefined, // İndirimsiz Fiyat (varyant bazlı)
        sku: r.sku ?? undefined,
        barcode: r.barcode ?? undefined,
        stock: r.stock ?? undefined,
        options: optionMap,
      }
    })

    // SKU çakışma kontrolü
    let skuConflict = false
    for (const v of variants) {
      if (v.sku) {
        const sk = String(v.sku).trim().toLowerCase()
        if (processedSkus.has(sk)) {
          errors.push({
            index: first._index,
            title: first.title,
            message: `SKU '${v.sku}' bu dosyada tekrarlanıyor (grup atlandı).`,
          })
          skuConflict = true
          break
        }
      }
    }
    if (skuConflict) continue

    // İlk satırdan genel bilgileri al
    const images = splitList(first.images)

    try {
      const product = await createVendorProduct(
        req.scope,
        resolved.seller.id,
        resolved.seller.handle,
        {
          title: first.title,
          description: first.description ?? undefined,
          thumbnail: first.thumbnail ?? undefined,
          images: images.length > 0 ? images : undefined,
          weight: first.weight ?? undefined,
          length: first.length ?? undefined,
          width: first.width ?? undefined,
          height: first.height ?? undefined,
          vat_rate: first.vat_rate ?? undefined,
          delivery_days: first.delivery_days ?? undefined,
          material: first.material ?? undefined,
          tags: splitList(first.tags),
          subtitle,
          brand_id,
          category_ids,
          // Çok-varyant modu
          options,
          variants,
        },
        String(first._index + 1)
      )
      // Tüm grup satırlarını başarılı olarak raporla
      const warningStr = warns.length ? warns.join("; ") : undefined
      created.push({
        index: first._index,
        id: product.id,
        title: `${product.title} (${variants.length} varyant)`,
        ...(warningStr ? { warning: warningStr } : {}),
      })
      // SKU'ları işlenmiş olarak kaydet
      for (const v of variants) {
        if (v.sku) processedSkus.add(String(v.sku).trim().toLowerCase())
      }
    } catch (e: any) {
      errors.push({
        index: first._index,
        title: first.title,
        message: e?.message || `Çok-varyantlı ürün oluşturulamadı (${variants.length} varyant).`,
      })
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

  return res.status(created.length || updated.length ? 201 : 400).json({
    created,
    updated,
    errors,
    total: parsed.data.rows.length,
    created_count: created.length,
    updated_count: updated.length,
    error_count: errors.length,
  })
}
