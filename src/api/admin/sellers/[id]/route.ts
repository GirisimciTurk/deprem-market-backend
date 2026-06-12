import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  legal_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  account_holder: z.string().optional().nullable(),
  commission_rate: z.number().min(0).max(100).optional(),
  status: z.enum(["pending", "active", "suspended"]).optional(),
})

/** POST /admin/sellers/:id — satıcıyı güncelle (onay/askıya alma/komisyon vb.). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const existing = await service.retrieveSeller(req.params.id).catch(() => null)
  if (!existing) return res.status(404).json({ message: "Satıcı bulunamadı." })

  const seller = await service.updateSellers({ id: req.params.id, ...parsed.data })
  return res.json({ seller })
}

/** DELETE /admin/sellers/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  await service.deleteSellers(req.params.id)
  return res.json({ id: req.params.id, object: "seller", deleted: true })
}
