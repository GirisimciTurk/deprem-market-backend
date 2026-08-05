import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runCargoSetup } from "../../../lib/cargo-setup"
import { errorMessage } from "../../../lib/errors"

/**
 * POST /admin/cargo-setup — Yurtiçi kargo altyapısını (provider + shipping option'lar)
 * prod'da kurar/yeniler. İdempotent. Prod imajında script çalıştırılamadığı için
 * deploy sonrası bu endpoint tetiklenir (marketplace-setup ile aynı desen).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const result = await runCargoSetup(req.scope)
    return res.json({ ok: true, ...result })
  } catch (e) {
    return res.status(500).json({ ok: false, message: errorMessage(e, "Kargo kurulumu başarısız.") })
  }
}
