import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"

export type AttributeType = "text" | "number" | "select" | "multiselect" | "boolean"

export type ResolvedAttribute = {
  id: string
  category_id: string
  key: string
  name: string
  type: AttributeType
  options: string[] | null
  unit: string | null
  required: boolean
  rank: number
}

/**
 * Bir kategori için tanımlı TÜM dinamik özellikleri döndürür — kategorinin kendisi
 * + tüm üst (ata) kategorileri. Trendyol'daki gibi özellikler ağaçta MİRAS alınır:
 * "Giyim" altına Renk/Beden tanımlanırsa "Giyim > Mont" da bunları gösterir.
 *
 * Aynı `key` birden çok seviyede tanımlıysa EN SPESİFİK (çocuğa en yakın) kazanır.
 * Sonuç rank'e (küçük önce), sonra ada göre sıralı döner.
 */
export async function resolveCategoryAttributes(
  scope: any,
  categoryId: string | null | undefined
): Promise<ResolvedAttribute[]> {
  if (!categoryId) return []
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  // Ata zincirini çıkar: chain[0] = seçilen kategori (en spesifik), sonrakiler üst.
  const chain: string[] = []
  let current: string | null | undefined = categoryId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "parent_category_id"],
      filters: { id: current },
    })
    current = (data?.[0] as any)?.parent_category_id
  }
  if (chain.length === 0) return []

  const mp = scope.resolve(MARKETPLACE_MODULE)
  const attrs: any[] = await mp.listCategoryAttributes({ category_id: chain })

  // key bazında dedup: zincirde daha düşük indeks (daha spesifik) kazanır.
  const depthOf = new Map(chain.map((id, i) => [id, i]))
  const byKey = new Map<string, any>()
  for (const a of attrs) {
    const existing = byKey.get(a.key)
    if (
      !existing ||
      (depthOf.get(a.category_id) ?? 99) < (depthOf.get(existing.category_id) ?? 99)
    ) {
      byKey.set(a.key, a)
    }
  }

  return Array.from(byKey.values())
    .map((a) => ({
      id: a.id,
      category_id: a.category_id,
      key: a.key,
      name: a.name,
      type: a.type,
      options: Array.isArray(a.options) ? a.options : null,
      unit: a.unit ?? null,
      required: !!a.required,
      rank: Number(a.rank ?? 0),
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "tr"))
}

/** Bir özellik değerini gösterim için metne çevirir (tipine göre). */
export function formatAttrValue(attr: ResolvedAttribute, value: unknown): string {
  if (attr.type === "multiselect" && Array.isArray(value)) return value.join(", ")
  if (attr.type === "boolean") return value === true || value === "true" ? "Evet" : "Hayır"
  if (attr.type === "number" && attr.unit) return `${value} ${attr.unit}`
  return String(value)
}

/**
 * Bir ürünün kategori özelliklerinden GÖSTERİM snapshot'ı üretir:
 * [{ key, name, value }] (rank sıralı). Ürünün metadata.specs alanına yazılır →
 * storefront ekstra fetch/anahtar-eşleme yapmadan doğrudan render eder.
 * (Admin özelliği sonradan yeniden adlandırırsa eski ürünler eski etiketi korur,
 *  yeniden düzenlenince güncellenir — Trendyol gibi snapshot davranışı.)
 */
export async function buildAttributeSpecs(
  scope: any,
  categoryId: string | null | undefined,
  values: Record<string, unknown> | null | undefined
): Promise<{ key: string; name: string; value: string }[]> {
  if (!categoryId || !values || typeof values !== "object") return []
  const defs = await resolveCategoryAttributes(scope, categoryId)
  const specs: { key: string; name: string; value: string }[] = []
  for (const d of defs) {
    const v = (values as Record<string, unknown>)[d.key]
    if (v == null) continue
    if (typeof v === "string" && v.trim() === "") continue
    if (Array.isArray(v) && v.length === 0) continue
    specs.push({ key: d.key, name: d.name, value: formatAttrValue(d, v) })
  }
  return specs
}
