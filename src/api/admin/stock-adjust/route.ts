import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import {
  getLevel,
  setStockedQuantity,
  recordMovement,
  resolveItemInfo,
  resolveLocationName,
  resolveActor,
} from "../../../lib/stock-movement"
import { maybeAlertLowStock } from "../../../lib/low-stock-mail"

const schema = z.object({
  inventory_item_id: z.string().min(1),
  location_id: z.string().min(1),
  stocked_quantity: z.number().int().min(0),
  reason: z.string().optional().nullable(),
})

/**
 * POST /admin/stock-adjust — bir lokasyonda stoklanan miktarı MUTLAK değere ayarlar,
 * farkı "manual" hareket olarak deftere yazar ve düşük stok eşiğini kontrol eder.
 * (WarehouseInventory'deki satır-içi düzenleme artık bunu çağırır.)
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz stok verisi.", issues: parsed.error.issues })
  }
  const { inventory_item_id, location_id, stocked_quantity, reason } = parsed.data

  const before = await getLevel(req.scope, inventory_item_id, location_id)
  const prevStocked = before?.stocked_quantity ?? 0
  const prevAvailable = before ? before.stocked_quantity - before.reserved_quantity : 0

  const resulting = await setStockedQuantity(req.scope, inventory_item_id, location_id, stocked_quantity)
  const delta = resulting - prevStocked

  const [info, locationName, actor] = await Promise.all([
    resolveItemInfo(req.scope, inventory_item_id),
    resolveLocationName(req.scope, location_id),
    resolveActor(req.scope, req.auth_context?.actor_id),
  ])

  if (delta !== 0) {
    await recordMovement(req.scope, {
      inventory_item_id,
      location_id,
      type: "manual",
      quantity_delta: delta,
      resulting_quantity: resulting,
      sku: info.sku,
      product_title: info.product_title,
      location_name: locationName,
      reason: reason ?? null,
      actor,
    })
  }

  // Stok azaldıysa düşük stok kontrolü.
  if (delta < 0) {
    void maybeAlertLowStock(req.scope, {
      inventoryItemId: inventory_item_id,
      locationId: location_id,
      previousAvailable: prevAvailable,
    })
  }

  return res.json({ ok: true, resulting_quantity: resulting, delta })
}
