import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../_lib/resolve-seller"
import { listContractsForSeller } from "../../../lib/seller-contracts"

/**
 * GET /vendors/contracts — satıcıya gösterilecek aktif sözleşmeler + her birini
 * (güncel sürümüyle) onaylayıp onaylamadığı. Panelde clickwrap onay ekranı bunu kullanır.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const contracts = await listContractsForSeller(req.scope, resolved.seller.id)
  const pending_count = contracts.filter((c) => c.required && !c.accepted).length

  return res.json({ contracts, pending_count })
}
