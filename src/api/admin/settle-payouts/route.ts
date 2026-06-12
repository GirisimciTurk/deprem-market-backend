import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { settlePendingPayouts, getHakedisDays } from "../../../lib/settlement"

/**
 * POST /admin/settle-payouts — hakediş işini elle tetikler: kargolanmış ve
 * bekleme süresini doldurmuş alt-siparişleri "eligible" (ödenebilir) yapar.
 * (Günlük cron da bunu yapar.)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const settled = await settlePendingPayouts(req.scope)
  return res.json({ ok: true, settled, hakedis_days: getHakedisDays() })
}
