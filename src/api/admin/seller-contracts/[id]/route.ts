import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().optional().nullable(),
  pdf_url: z.string().url().optional().nullable(),
  required: z.boolean().optional(),
  is_active: z.boolean().optional(),
  // true ise sürüm +1 artırılır → tüm satıcılar yeniden onaylamak zorunda kalır.
  bump_version: z.boolean().optional(),
})

/**
 * POST /admin/seller-contracts/:id — sözleşmeyi günceller. İçerik değişip yeniden onay
 * isteniyorsa bump_version:true ile sürüm artırılır (satıcılar yeni sürümü onaylamalı).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const existing = await service.retrieveSellerContract(req.params.id).catch(() => null)
  if (!existing) return res.status(404).json({ message: "Sözleşme bulunamadı." })

  const { bump_version, ...fields } = parsed.data
  const update: Record<string, unknown> = { id: req.params.id, ...fields }
  if (bump_version) update.version = Number((existing as any).version || 1) + 1

  const contract = await service.updateSellerContracts(update)
  return res.json({ contract })
}

/** DELETE /admin/seller-contracts/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  await service.deleteSellerContracts(req.params.id)
  return res.json({ id: req.params.id, object: "seller_contract", deleted: true })
}
