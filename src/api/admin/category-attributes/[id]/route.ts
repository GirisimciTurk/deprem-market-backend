import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  type: z.enum(["text", "number", "select", "multiselect", "boolean"]).optional(),
  options: z.array(z.string().min(1)).optional().nullable(),
  unit: z.string().max(16).optional().nullable(),
  required: z.boolean().optional(),
  rank: z.number().int().optional(),
})

/** POST /admin/category-attributes/:id — özelliği günceller. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const update: Record<string, unknown> = { id: req.params.id }
  if (d.name !== undefined) update.name = d.name.trim()
  if (d.type !== undefined) update.type = d.type
  if (d.unit !== undefined) update.unit = d.unit?.trim() || null
  if (d.required !== undefined) update.required = d.required
  if (d.rank !== undefined) update.rank = d.rank
  // options yalnız select/multiselect'te anlamlı; tip değişimini de hesaba kat.
  if (d.options !== undefined) update.options = d.options
  if (d.type && d.type !== "select" && d.type !== "multiselect") update.options = null

  // options string[] → model.json() alanı için `as any`.
  const attribute = await marketplace.updateCategoryAttributes(update as any)
  return res.json({ attribute })
}

/** DELETE /admin/category-attributes/:id — özelliği siler. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.deleteCategoryAttributes(req.params.id)
  return res.json({ id: req.params.id, object: "category_attribute", deleted: true })
}
