import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runContractSetup } from "../../../lib/contract-setup"

/**
 * POST /admin/contract-setup — pazaryeri satıcı sözleşmelerini (Çerçeve + KVKK +
 * Komisyon Eki + Yasaklı Ürünler) kurar. İdempotent (install-once); prod'da imajda
 * script kaynağı bulunmadığı için kurulum bu uçtan tetiklenir. Admin-only.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const result = await runContractSetup(req.scope)
  return res.json({ ok: true, ...result })
}
