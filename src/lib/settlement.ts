import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

/** Hakediş bekleme süresi (gün). Kargolanan sipariş bu kadar gün sonra ödenebilir olur. */
export function getHakedisDays(): number {
  const n = Number(process.env.HAKEDIS_DAYS ?? 14)
  return Number.isFinite(n) && n >= 0 ? n : 14
}

/**
 * Kargolanmış ve bekleme süresini (eligible_at) doldurmuş "pending" alt-siparişleri
 * "eligible" (ödenebilir) yapar. İdempotent. Cron + manuel tetikten çağrılır.
 *
 * @returns eligible'a çevrilen kayıt sayısı
 */
export async function settlePendingPayouts(container: any): Promise<number> {
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const now = new Date()

  const due = await marketplace.listSellerOrders(
    {
      payout_status: "pending",
      fulfillment_status: "fulfilled",
      eligible_at: { $lte: now },
    },
    { take: 1000 }
  )
  if (due.length === 0) return 0

  await marketplace.updateSellerOrders(
    due.map((o: any) => ({ id: o.id, payout_status: "eligible" })) as any
  )
  return due.length
}
