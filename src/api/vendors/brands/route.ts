import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { notifyAdmins } from "../../../lib/notify"

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

/**
 * GET /vendors/brands?q= — satıcının ürün eklerken seçebileceği ONAYLI markalar
 * (autocomplete). q ile ada göre filtreler.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const q = (req.query.q as string | undefined)?.trim()

  const filters: Record<string, unknown> = { status: "approved" }
  if (q) filters.name = { $ilike: `%${q}%` }

  const brands = await marketplace.listBrands(filters, {
    take: 50,
    order: { name: "ASC" },
  })
  return res.json({ brands })
}

const schema = z.object({ name: z.string().min(1).max(120) })

/**
 * POST /vendors/brands — satıcı listede olmayan bir marka TALEP eder. Marka
 * "pending" oluşturulur (admin onaylayana dek satıcı seçebilir ama onay bekler).
 * Aynı slug onaylıysa onu döndürür (mükerrer talep engeli).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Marka adı gerekli." })
  }
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const slug = slugify(parsed.data.name)
  const [existing] = await marketplace.listBrands({ slug }, { take: 1 })
  if (existing) {
    // Zaten var (onaylı veya bekleyen) → onu döndür, mükerrer kayıt açma.
    return res.status(200).json({ brand: existing, existed: true })
  }

  const brand = await marketplace.createBrands({
    name: parsed.data.name.trim(),
    slug,
    status: "pending",
    requested_by_seller_id: resolved.seller.id,
  })

  await notifyAdmins(req.scope, {
    type: "brand_request",
    title: "Onay bekleyen marka talebi",
    body: `${resolved.seller.name}: ${parsed.data.name.trim()}`,
    link: "/brands",
  })

  return res.status(201).json({ brand, existed: false })
}
