import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  recordMovement,
  resolveVariantInventory,
  getLevel,
} from "../lib/stock-movement"
import { maybeAlertLowStock } from "../lib/low-stock-mail"

/**
 * Sipariş için fulfillment oluşturulduğunda (fiziksel stok bu anda düşer) her kalem için
 * bir "sale" stok hareketi yazar ve düşük stok eşiğini kontrol eder.
 * Event: `order.fulfillment_created`. Payload: `{ order_id, fulfillment_id }`.
 * Best-effort: hata sipariş akışını kırmaz.
 */
export default async function fulfillmentStockHandler({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; fulfillment_id: string }>) {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: fulfillments } = await query.graph({
      entity: "fulfillment",
      fields: [
        "location_id",
        "items.quantity",
        "items.line_item.variant_id",
        "items.line_item.title",
        "items.line_item.product_title",
      ],
      filters: { id: data.fulfillment_id },
    })
    const f = fulfillments?.[0]
    if (!f?.location_id) return

    for (const fi of f.items ?? []) {
      const li = fi.line_item
      const variantId = li?.variant_id
      const qty = Number(fi.quantity) || 0
      if (!variantId || qty <= 0) continue

      const inv = await resolveVariantInventory(container, variantId)
      if (!inv.inventory_item_id) continue

      const level = await getLevel(container, inv.inventory_item_id, f.location_id)
      await recordMovement(container, {
        inventory_item_id: inv.inventory_item_id,
        location_id: f.location_id,
        type: "sale",
        quantity_delta: -qty,
        resulting_quantity: level?.stocked_quantity ?? null,
        sku: inv.sku,
        product_title: inv.product_title ?? li?.product_title ?? li?.title ?? null,
        reference_id: data.order_id,
        reason: "Sipariş kargo hazırlığı (fulfillment)",
      })

      await maybeAlertLowStock(container, {
        inventoryItemId: inv.inventory_item_id,
        locationId: f.location_id,
      })
    }
  } catch {
    /* stok kaydı kritik değil, sipariş akışını kırma */
  }
}

export const config: SubscriberConfig = {
  event: "order.fulfillment_created",
}
