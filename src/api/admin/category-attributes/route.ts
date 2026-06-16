import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

/** Görünen addan makine anahtarı (snake_case, Türkçe karakterler sadeleştirilir). */
function keyify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "")
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "ozellik"
  )
}

/**
 * GET /admin/category-attributes?category_id= — kategori bazlı dinamik özellikler.
 * category_id verilirse YALNIZ o kategoriye DOĞRUDAN tanımlı özellikler döner
 * (miras yok; yönetim ekranı için). Verilmezse tüm özellikler döner.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const categoryId = req.query.category_id as string | undefined

  const filters: Record<string, unknown> = {}
  if (categoryId) filters.category_id = categoryId

  const attributes = await marketplace.listCategoryAttributes(filters, {
    take: 1000,
    order: { rank: "ASC" },
  })

  return res.json({ attributes, count: (attributes as any[]).length })
}

const schema = z.object({
  category_id: z.string().min(1),
  name: z.string().min(1).max(80),
  key: z.string().max(48).optional(),
  type: z.enum(["text", "number", "select", "multiselect", "boolean"]).default("text"),
  options: z.array(z.string().min(1)).optional().nullable(),
  unit: z.string().max(16).optional().nullable(),
  required: z.boolean().optional(),
  rank: z.number().int().optional(),
})

/** POST /admin/category-attributes — kategoriye yeni özellik tanımlar. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const key = (d.key && d.key.trim()) || keyify(d.name)
  // Aynı kategoride aynı key varsa güncelle (upsert), yoksa oluştur.
  const [existing] = await marketplace.listCategoryAttributes(
    { category_id: d.category_id, key },
    { take: 1 }
  )
  const payload = {
    category_id: d.category_id,
    key,
    name: d.name.trim(),
    type: d.type,
    options: d.type === "select" || d.type === "multiselect" ? d.options ?? [] : null,
    unit: d.unit?.trim() || null,
    required: !!d.required,
    rank: d.rank ?? 0,
  }
  // options bir string[]; model.json() alanı Record beklediği için `as any` gerekir.
  const attribute = existing
    ? await marketplace.updateCategoryAttributes({ id: (existing as any).id, ...payload } as any)
    : await marketplace.createCategoryAttributes(payload as any)

  return res.status(existing ? 200 : 201).json({ attribute })
}
