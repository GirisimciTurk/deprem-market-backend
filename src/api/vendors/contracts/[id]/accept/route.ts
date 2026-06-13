import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"

const schema = z.object({
  full_name: z.string().trim().min(1).max(160).optional(),
})

/**
 * POST /vendors/contracts/:id/accept  { full_name? }
 * Satıcı, sözleşmenin GÜNCEL sürümünü dijital olarak onaylar (clickwrap). Onay kaydı
 * zaman damgası + IP + ad-soyad ile saklanır. Aynı sürüm için idempotent.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const contract = await service.retrieveSellerContract(req.params.id).catch(() => null)
  if (!contract || !(contract as any).is_active) {
    return res.status(404).json({ message: "Sözleşme bulunamadı." })
  }

  const version = Number((contract as any).version || 1)
  const sellerId = resolved.seller.id

  // Aynı sürüm zaten onaylandıysa tekrar kayıt oluşturma (idempotent).
  const existing = await service.listSellerContractAcceptances({
    seller_id: sellerId,
    contract_id: req.params.id,
    version,
  })
  if (existing.length > 0) {
    return res.json({ ok: true, already: true })
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.socket as any)?.remoteAddress ||
    null

  await service.createSellerContractAcceptances([
    {
      seller_id: sellerId,
      contract_id: req.params.id,
      version,
      full_name: parsed.data.full_name ?? null,
      ip,
    },
  ])

  return res.status(201).json({ ok: true })
}
