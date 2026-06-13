import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../../_lib/resolve-seller"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { endSellerCampaign } from "../../../../lib/seller-campaigns"

/**
 * DELETE /vendors/campaigns/:id — satıcı kendi kampanyasını bitirir.
 * Arkadaki price list silinir (fiyatlar tabana döner), kayıt "ended" olur.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const campaign = await marketplace.retrieveSellerCampaign(req.params.id).catch(() => null)
  if (!campaign || (campaign as any).seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Kampanya bulunamadı." })
  }
  if ((campaign as any).status === "ended") {
    return res.json({ message: "Kampanya zaten bitmiş." })
  }

  await endSellerCampaign(req.scope, campaign)
  return res.json({ message: "Kampanya bitirildi." })
}
