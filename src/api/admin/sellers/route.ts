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
      .slice(0, 96) || `satici-${Date.now()}`
  )
}

const createSchema = z.object({
  name: z.string().min(1),
  legal_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  account_holder: z.string().optional().nullable(),
  commission_rate: z.number().min(0).max(100).optional(),
  status: z.enum(["pending", "active", "suspended"]).optional(),
})

/** GET /admin/sellers?status=&q=&limit=&offset= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (status && ["pending", "active", "suspended"].includes(status)) filters.status = status
  if (q) {
    const like = `%${q}%`
    filters.$or = [{ name: { $ilike: like } }, { email: { $ilike: like } }, { legal_name: { $ilike: like } }]
  }

  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [sellers, count] = await service.listAndCountSellers(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })
  return res.json({ sellers, count, offset, limit })
}

/** POST /admin/sellers — admin tarafından satıcı oluşturma (login bağlama sonraki adım). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz satıcı verisi.", issues: parsed.error.issues })
  }
  const data = parsed.data
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const seller = await service.createSellers({
    name: data.name,
    handle: slugify(data.name),
    legal_name: data.legal_name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    tax_number: data.tax_number ?? null,
    iban: data.iban ?? null,
    account_holder: data.account_holder ?? null,
    commission_rate: data.commission_rate ?? 10,
    status: data.status ?? "active",
  })
  return res.status(201).json({ seller })
}
