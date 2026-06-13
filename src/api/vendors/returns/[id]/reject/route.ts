import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { rejectSellerReturn } from "../../../../../lib/seller-return-actions"

/**
 * POST /vendors/returns/:id/reject — satıcı iadeyi REDDEDER. Body: { reason? }
 * :id = seller_return id. Stok/clawback/para iadesi YOK; müşteriye ret maili gider.
 * Admin hakem olarak satıcı adına kabul edebilir.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const id = req.params.id
  const reason = ((req.body as any)?.reason ?? "").toString().trim() || null
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const sr: any = await marketplace.retrieveSellerReturn(id).catch(() => null)
  if (!sr || sr.seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "İade bulunamadı." })
  }
  if (sr.status !== "requested") {
    return res.status(400).json({ message: "Bu iade zaten sonuçlandırılmış." })
  }

  try {
    await rejectSellerReturn(req.scope, sr, reason)
    return res.json({ rejected: true })
  } catch (e: any) {
    req.scope.resolve("logger").error(`[vendor-return-reject] ${id}: ${e?.message}`)
    return res.status(400).json({ message: e?.message || "İade reddedilemedi." })
  }
}
