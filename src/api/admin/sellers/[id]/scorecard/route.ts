import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import {
  computeSellerScorecard,
  computeSellerAnalytics,
} from "../../../../../lib/seller-scorecard"

/**
 * GET /admin/sellers/:id/scorecard?days=30
 * Bir satıcının performans karnesi + satış analitiği (admin gözetimi).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const seller = await marketplace.retrieveSeller(sellerId).catch(() => null)
  if (!seller) return res.status(404).json({ message: "Satıcı bulunamadı." })

  const days = Number(req.query.days) || 30
  const [scorecard, analytics] = await Promise.all([
    computeSellerScorecard(req.scope, sellerId),
    computeSellerAnalytics(req.scope, sellerId, days),
  ])

  return res.json({ scorecard, analytics })
}
