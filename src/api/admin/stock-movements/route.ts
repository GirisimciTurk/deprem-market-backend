import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { STOCK_MOVEMENT_MODULE } from "../../../modules/stock_movement"
import type StockMovementModuleService from "../../../modules/stock_movement/service"

const TYPES = ["sale", "return", "manual", "transfer_in", "transfer_out", "count", "initial"]

/** GET /admin/stock-movements?type=&location_id=&inventory_item_id=&q=&limit=&offset= — stok hareket defteri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const type = req.query.type as string | undefined
  const locationId = req.query.location_id as string | undefined
  const inventoryItemId = req.query.inventory_item_id as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (type && TYPES.includes(type)) filters.type = type
  if (locationId) filters.location_id = locationId
  if (inventoryItemId) filters.inventory_item_id = inventoryItemId
  if (q) {
    const like = `%${q}%`
    filters.$or = [{ sku: { $ilike: like } }, { product_title: { $ilike: like } }]
  }

  const svc: StockMovementModuleService = req.scope.resolve(STOCK_MOVEMENT_MODULE)
  const [movements, count] = await svc.listAndCountStockMovements(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ movements, count, offset, limit })
}
