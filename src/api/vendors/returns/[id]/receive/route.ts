import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { acceptSellerReturn } from "../../../../../lib/seller-return-actions"

/**
 * POST /vendors/returns/:id/receive — satıcı iadeyi TESLİM ALIP ONAYLAR.
 * :id = seller_return id. Restock + komisyon clawback + müşteriye otomatik para iadesi.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const id = req.params.id
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const sr: any = await marketplace.retrieveSellerReturn(id).catch(() => null)
  if (!sr || sr.seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "İade bulunamadı." })
  }
  if (sr.status !== "requested") {
    return res.status(400).json({ message: "Bu iade zaten sonuçlandırılmış." })
  }

  try {
    const { refunded } = await acceptSellerReturn(req.scope, sr)
    return res.json({ received: true, refunded_amount: refunded })
  } catch (e: any) {
    req.scope.resolve("logger").error(`[vendor-return-receive] ${id}: ${e?.message}`)
    return res.status(400).json({ message: e?.message || "İade teslim alınamadı." })
  }
}
