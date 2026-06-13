import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { getOrCreateCargoTariff } from "../../../lib/cargo-fee"

/** GET /admin/cargo-tariff — aktif desi-bazlı kargo tarifesi (yoksa varsayılan oluşturulur). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const tariff = await getOrCreateCargoTariff(req.scope)
  return res.json({ tariff })
}

const updateSchema = z.object({
  // [{ max_desi, fee(kuruş) }] — fee major değil, kuruş bekleriz (frontend ×100 yapar).
  tiers: z
    .array(
      z.object({
        max_desi: z.number().int().positive(),
        fee: z.number().int().min(0),
      })
    )
    .min(1),
  per_extra_fee: z.number().int().min(0),
})

/** PUT /admin/cargo-tariff — tarifeyi günceller (singleton). */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz tarife.", issues: parsed.error.issues })
  }
  // max_desi'ye göre artan sırala (hesaplama sıralı bekliyor).
  const tiers = [...parsed.data.tiers].sort((a, b) => a.max_desi - b.max_desi)

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const current = await getOrCreateCargoTariff(req.scope)
  await marketplace.updateCargoTariffs({
    id: current.id,
    tiers,
    per_extra_fee: parsed.data.per_extra_fee,
  } as any)

  const tariff = await getOrCreateCargoTariff(req.scope)
  return res.json({ tariff })
}
