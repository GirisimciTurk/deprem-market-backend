import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

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

/** GET /admin/brands?status=&q=&limit=&offset= — marka listesi (yönetim). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()

  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  if (q) filters.name = { $ilike: `%${q}%` }

  const [brands, count] = await marketplace.listAndCountBrands(filters, {
    take: limit,
    skip: offset,
    order: { name: "ASC" },
  })

  return res.json({ brands, count, offset, limit })
}

const schema = z.object({
  name: z.string().min(1).max(120),
  logo: z.string().url().optional().nullable(),
  // Admin oluşturursa varsayılan "approved" (satıcılar hemen seçebilir).
  status: z.enum(["approved", "pending"]).optional(),
})

/** POST /admin/brands — yeni marka ekler (varsayılan onaylı). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const slug = slugify(d.name)
  const [existing] = await marketplace.listBrands({ slug }, { take: 1 })
  if (existing) {
    return res.status(409).json({ message: "Bu isimde bir marka zaten var.", brand: existing })
  }

  const brand = await marketplace.createBrands({
    name: d.name.trim(),
    slug,
    logo: d.logo?.trim() || null,
    status: d.status ?? "approved",
  })
  return res.status(201).json({ brand })
}
