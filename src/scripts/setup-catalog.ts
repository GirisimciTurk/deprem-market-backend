import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"

/**
 * setup:catalog — katalog zenginleştirme demo/başlangıç verisi (idempotent):
 *  1) Birkaç ONAYLI marka.
 *  2) Kök (üst) kategorilere ortak dinamik özellik seti (Renk/Garanti/Menşei).
 *     Alt kategoriler bu özellikleri MİRAS alır (resolveCategoryAttributes).
 *
 * Çalıştır: npm run setup:catalog
 */
function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "")
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "marka"
  )
}

const BRANDS = ["DepremTek", "Genel / Markasız", "Sahibinden Üretim", "İthal", "Yerli Üretim"]

// Kök kategorilere eklenecek ortak özellikler (key auto). required=false → engellemez.
const COMMON_ATTRS: {
  name: string
  type: "text" | "number" | "select" | "multiselect" | "boolean"
  options?: string[]
  unit?: string
  rank: number
}[] = [
  { name: "Renk", type: "select", options: ["Siyah", "Beyaz", "Kırmızı", "Mavi", "Yeşil", "Sarı", "Turuncu", "Gri", "Çok Renkli"], rank: 1 },
  { name: "Garanti Süresi", type: "number", unit: "ay", rank: 2 },
  { name: "Menşei", type: "text", rank: 3 },
]

function keyify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "").toLowerCase().replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "ozellik"
  )
}

export default async function setupCatalog({ container }: { container: any }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace = container.resolve(MARKETPLACE_MODULE)

  // 1) Markalar (idempotent: slug ile kontrol).
  let brandsCreated = 0
  for (const name of BRANDS) {
    const slug = slugify(name)
    const [existing] = await marketplace.listBrands({ slug }, { take: 1 })
    if (!existing) {
      await marketplace.createBrands({ name, slug, status: "approved" })
      brandsCreated++
    }
  }
  logger.info(`[setup:catalog] Marka: ${brandsCreated} yeni eklendi (toplam hedef ${BRANDS.length}).`)

  // 2) Kök kategorilere ortak özellikler.
  const { data: roots } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "parent_category_id"],
    filters: { is_active: true, is_internal: false },
    pagination: { take: 1000 } as any,
  })
  const rootCats = (roots as any[]).filter((c) => !c.parent_category_id)
  if (rootCats.length === 0) {
    logger.info("[setup:catalog] Kök kategori bulunamadı; özellik atlanıyor.")
    return
  }

  let attrsCreated = 0
  for (const cat of rootCats) {
    for (const a of COMMON_ATTRS) {
      const key = keyify(a.name)
      const [exists] = await marketplace.listCategoryAttributes(
        { category_id: cat.id, key },
        { take: 1 }
      )
      if (!exists) {
        await marketplace.createCategoryAttributes({
          category_id: cat.id,
          key,
          name: a.name,
          type: a.type,
          options: a.type === "select" || a.type === "multiselect" ? a.options ?? [] : null,
          unit: a.unit ?? null,
          required: false,
          rank: a.rank,
        } as any)
        attrsCreated++
      }
    }
  }
  logger.info(
    `[setup:catalog] Özellik: ${rootCats.length} kök kategoriye ${attrsCreated} özellik eklendi.`
  )
}
