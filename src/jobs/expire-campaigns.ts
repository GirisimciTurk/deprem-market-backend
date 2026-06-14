import { MedusaContainer } from "@medusajs/framework/types"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import { endSellerCampaign } from "../lib/seller-campaigns"

/**
 * Saatlik kampanya süre-dolum işi: bitiş tarihi geçmiş ama hâlâ "active" olan
 * satıcı kampanyalarını sonlandırır (price list silinir → fiyat tabana döner,
 * kayıt "ended"). Aksi halde Medusa fiyatı uygulamayı durdurur ama ölü "active"
 * price-list'ler birikir.
 */
export default async function expireCampaignsJob(container: MedusaContainer) {
  const logger = container.resolve("logger")
  const marketplace: any = container.resolve(MARKETPLACE_MODULE)
  const now = new Date()

  const expired = await marketplace.listSellerCampaigns(
    { status: "active", ends_at: { $lte: now } },
    { take: 500 }
  )
  let ended = 0
  for (const c of expired as any[]) {
    try {
      await endSellerCampaign(container, c)
      ended++
    } catch (e: any) {
      logger.error(`[expire-campaigns] ${c.id}: ${e?.message}`)
    }
  }
  if (ended > 0) logger.info(`[expire-campaigns] ${ended} süresi dolan kampanya sonlandırıldı.`)
}

export const config = {
  name: "expire-campaigns-hourly",
  schedule: "0 * * * *",
}
