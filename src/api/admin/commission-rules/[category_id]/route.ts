import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

/**
 * DELETE /admin/commission-rules/:category_id — kategori komisyon kuralını kaldırır.
 * Sonrasında o kategorideki ürünler satıcının sabit oranını kullanır.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [existing] = await marketplace.listCommissionRules(
    { category_id: req.params.category_id },
    { take: 1 }
  )
  if (existing) await marketplace.deleteCommissionRules((existing as any).id)
  return res.json({ category_id: req.params.category_id, deleted: true })
}
