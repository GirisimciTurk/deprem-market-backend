import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { getHakedisDays } from "../../../../../lib/settlement"

/**
 * POST /vendors/orders/:id/fulfill — satıcı kendi alt-siparişini "kargolandı"
 * olarak işaretler. Sahiplik doğrulanır (başkasının alt-siparişi 403/404).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const so = await marketplace.retrieveSellerOrder(req.params.id).catch(() => null)
  if (!so || (so as any).seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Alt-sipariş bulunamadı." })
  }
  if (so.fulfillment_status === "canceled") {
    return res.status(400).json({ message: "İptal edilmiş alt-sipariş kargolanamaz." })
  }

  // Kargolama anından itibaren hakediş bekleme süresi başlar.
  const now = new Date()
  const eligibleAt = new Date(now.getTime() + getHakedisDays() * 24 * 60 * 60 * 1000)
  const updated = await marketplace.updateSellerOrders({
    id: so.id,
    fulfillment_status: "fulfilled",
    fulfilled_at: now,
    eligible_at: eligibleAt,
  } as any)
  return res.json({ order: updated })
}
