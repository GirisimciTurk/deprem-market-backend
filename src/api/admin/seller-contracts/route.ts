import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

/**
 * GET /admin/seller-contracts — tüm satıcı sözleşmelerini listeler (aktif + pasif).
 * Admin-only (middlewares ADMIN_ONLY_MATCHERS).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [contracts, count] = await service.listAndCountSellerContracts(
    {},
    { order: { created_at: "DESC" } }
  )
  return res.json({ contracts, count })
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().optional().nullable(),
  pdf_url: z.string().url().optional().nullable(),
  required: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

/** POST /admin/seller-contracts — yeni sözleşme oluşturur (version 1). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz sözleşme verisi.", issues: parsed.error.issues })
  }
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [contract] = await service.createSellerContracts([
    {
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      pdf_url: parsed.data.pdf_url ?? null,
      required: parsed.data.required ?? true,
      is_active: parsed.data.is_active ?? true,
      version: 1,
    },
  ])
  return res.status(201).json({ contract })
}
