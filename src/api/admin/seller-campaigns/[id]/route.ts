import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { endSellerCampaign } from "../../../../lib/seller-campaigns"

/**
 * DELETE /admin/seller-campaigns/:id — admin bir satıcı kampanyasını gözetim
 * gereği bitirir (uygunsuz/hatalı indirim). Price list silinir, kayıt "ended".
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const campaign = await marketplace.retrieveSellerCampaign(req.params.id).catch(() => null)
  if (!campaign) return res.status(404).json({ message: "Kampanya bulunamadı." })
  if ((campaign as any).status === "ended") {
    return res.json({ message: "Kampanya zaten bitmiş." })
  }

  await endSellerCampaign(req.scope, campaign)
  return res.json({ message: "Kampanya bitirildi." })
}
