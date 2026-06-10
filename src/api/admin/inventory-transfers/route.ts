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
  from_location_id: z.string().min(1),
  to_location_id: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.string().optional().nullable(),
})

/**
 * POST /admin/inventory-transfers — bir envanter kalemini iki lokasyon arasında taşır.
 * Kaynaktan düşer, hedefe ekler, iki hareket (transfer_out + transfer_in) yazar.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz transfer verisi.", issues: parsed.error.issues })
  }
  const { inventory_item_id, from_location_id, to_location_id, quantity, reason } = parsed.data

  if (from_location_id === to_location_id) {
    return res.status(400).json({ message: "Kaynak ve hedef lokasyon aynı olamaz." })
  }

  const from = await getLevel(req.scope, inventory_item_id, from_location_id)
  const fromAvailable = from ? from.stocked_quantity - from.reserved_quantity : 0
  if (fromAvailable < quantity) {
    return res.status(400).json({
      message: `Kaynak lokasyonda yeterli stok yok. Taşınabilir: ${fromAvailable} adet.`,
    })
  }
  const to = await getLevel(req.scope, inventory_item_id, to_location_id)

  // Kaynaktan düş, hedefe ekle.
  const fromResulting = await setStockedQuantity(
    req.scope,
    inventory_item_id,
    from_location_id,
    from!.stocked_quantity - quantity
  )
  const toResulting = await setStockedQuantity(
    req.scope,
    inventory_item_id,
    to_location_id,
    (to?.stocked_quantity ?? 0) + quantity
  )

  const [info, fromName, toName, actor] = await Promise.all([
    resolveItemInfo(req.scope, inventory_item_id),
    resolveLocationName(req.scope, from_location_id),
    resolveLocationName(req.scope, to_location_id),
    resolveActor(req.scope, req.auth_context?.actor_id),
  ])
  const reference_id = `transfer_${Date.now()}`

  await recordMovement(req.scope, {
    inventory_item_id,
    location_id: from_location_id,
    type: "transfer_out",
    quantity_delta: -quantity,
    resulting_quantity: fromResulting,
    sku: info.sku,
    product_title: info.product_title,
    location_name: fromName,
    reason: reason ?? `Transfer → ${toName ?? to_location_id}`,
    reference_id,
    actor,
  })
  await recordMovement(req.scope, {
    inventory_item_id,
    location_id: to_location_id,
    type: "transfer_in",
    quantity_delta: quantity,
    resulting_quantity: toResulting,
    sku: info.sku,
    product_title: info.product_title,
    location_name: toName,
    reason: reason ?? `Transfer ← ${fromName ?? from_location_id}`,
    reference_id,
    actor,
  })

  // Kaynak lokasyonda düşük stok kontrolü.
  void maybeAlertLowStock(req.scope, {
    inventoryItemId: inventory_item_id,
    locationId: from_location_id,
    previousAvailable: fromAvailable,
  })

  return res.json({ ok: true, from_resulting: fromResulting, to_resulting: toResulting, reference_id })
}
