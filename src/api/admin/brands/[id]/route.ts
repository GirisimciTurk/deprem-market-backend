import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logo: z.string().url().optional().nullable(),
  // Onay/askıya alma: "approved" ⇒ satıcılar seçebilir.
  status: z.enum(["approved", "pending"]).optional(),
})

/** POST /admin/brands/:id — markayı günceller (onayla / düzenle). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const update: Record<string, unknown> = { id: req.params.id }
  if (d.name !== undefined) update.name = d.name.trim()
  if (d.logo !== undefined) update.logo = d.logo?.trim() || null
  if (d.status !== undefined) {
    update.status = d.status
    // Onaylanınca talep eden satıcı izini temizle.
    if (d.status === "approved") update.requested_by_seller_id = null
  }

  const brand = await marketplace.updateBrands(update)
  return res.json({ brand })
}

/** DELETE /admin/brands/:id — markayı siler. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.deleteBrands(req.params.id)
  return res.json({ id: req.params.id, object: "brand", deleted: true })
}
