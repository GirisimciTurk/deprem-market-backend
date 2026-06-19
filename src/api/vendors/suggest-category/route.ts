import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"
import { isLlmEnabled, suggestProductCategory } from "../../../lib/llm"

const bodySchema = z.object({
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000).optional().nullable(),
})

/**
 * POST /vendors/suggest-category  { title, description? }
 * Ürün başlığından (ve varsa açıklamadan) MEVCUT aktif kategorilerden en uygununu
 * önerir (LLM sınıflandırma, gerçek listeye kısıtlı). Satıcı sihirbazında "Tavsiye
 * edilen kategori" çipi bunu kullanır. Öneri ZORUNLU DEĞİL — satıcı yine de elle seçer.
 * AI kapalı / hata / eşleşme yoksa { suggestion: null } döner (UI çip göstermez, fail-open).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  // AI kapalıysa sessizce öneri yok (fail-open) — UI çipi göstermez.
  if (!isLlmEnabled()) {
    return res.json({ suggestion: null, alternates: [], disabled: true })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: cats } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "parent_category_id"],
    filters: { is_active: true, is_internal: false },
    pagination: { take: 500, order: { name: "ASC" } },
  })
  if (!cats || cats.length === 0) {
    return res.json({ suggestion: null, alternates: [] })
  }

  const byId = new Map<string, any>((cats as any[]).map((c) => [c.id, c]))
  // Kök → kendisi ad yolu ("Üst › Alt"); döngü koruması için seen seti.
  const pathOf = (id: string): string => {
    const names: string[] = []
    let cur: string | null | undefined = id
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const c = byId.get(cur)
      if (!c) break
      names.unshift(c.name)
      cur = c.parent_category_id
    }
    return names.join(" › ")
  }

  const list = (cats as any[]).map((c) => ({ id: c.id, path: pathOf(c.id) }))

  const out = await suggestProductCategory({
    title: parsed.data.title,
    description: parsed.data.description ?? undefined,
    categories: list,
  })
  if (!out.ok) {
    return res.json({ suggestion: null, alternates: [], error: out.error })
  }

  const toCat = (id: string) => {
    const c = byId.get(id)
    return c ? { id, name: c.name, path: pathOf(id) } : null
  }

  return res.json({
    suggestion: {
      ...toCat(out.data.category_id),
      confidence: out.data.confidence,
      reason: out.data.reason,
    },
    alternates: out.data.alternates.map(toCat).filter(Boolean),
  })
}
