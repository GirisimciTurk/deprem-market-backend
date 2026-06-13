import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import {
  acceptSellerReturn,
  upholdRejectSellerReturn,
} from "../../../../../lib/seller-return-actions"

/**
 * POST /admin/seller-returns/:id/arbitrate  { action: "accept" | "uphold_reject" }
 * Admin hakem:
 *  - accept: iadeyi satıcı adına teslim al + otomatik para iadesi (satıcı reddetmiş olsa bile).
 *  - uphold_reject: reddi onayla → native return iptal (para iadesi YOK), seller_return rejected kalır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const action = (req.body as any)?.action as string | undefined
  if (!action || !["accept", "uphold_reject"].includes(action)) {
    return res.status(400).json({ message: "Geçersiz işlem." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const sr: any = await marketplace.retrieveSellerReturn(id).catch(() => null)
  if (!sr) return res.status(404).json({ message: "İade bulunamadı." })

  try {
    if (action === "accept") {
      if (sr.status === "received") {
        return res.status(400).json({ message: "Bu iade zaten teslim alınmış." })
      }
      const { refunded } = await acceptSellerReturn(req.scope, sr)
      return res.json({ accepted: true, refunded_amount: refunded })
    }

    // uphold_reject
    if (sr.status === "received") {
      return res.status(400).json({ message: "Teslim alınmış iade reddi onaylanamaz." })
    }
    await upholdRejectSellerReturn(req.scope, sr)
    // seller_return rejected değilse (admin doğrudan onayladıysa) işaretle.
    if (sr.status !== "rejected") {
      await marketplace.updateSellerReturns({
        id: sr.id,
        status: "rejected",
        rejected_at: new Date(),
      } as any)
    }
    return res.json({ upheld: true })
  } catch (e: any) {
    req.scope.resolve("logger").error(`[arbitrate:${action}] ${id}: ${e?.message}`)
    return res.status(400).json({ message: e?.message || "İşlem başarısız." })
  }
}
