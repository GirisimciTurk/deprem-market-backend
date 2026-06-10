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
    // NOT: fulfillment.items.line_item.* cross-modül yolu query.graph'ta patlıyor ("strategy"
    // hatası). Bunun yerine FulfillmentItem'ın skaler line_item_id'sini alıp variant_id'yi
    // siparişin kalemlerinden eşliyoruz.
    const { data: fulfillments } = await query.graph({
      entity: "fulfillment",
      fields: ["location_id", "items.quantity", "items.line_item_id", "items.title"],
      filters: { id: data.fulfillment_id },
    })
    const f = fulfillments?.[0]
    if (!f?.location_id) return

    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["items.id", "items.variant_id", "items.product_title", "items.title"],
      filters: { id: data.order_id },
    })
    const lineMap = new Map<string, { variant_id?: string; title?: string }>(
      (orders?.[0]?.items ?? []).map((it: any) => [
        it.id,
        { variant_id: it.variant_id, title: it.product_title || it.title },
      ])
    )

    for (const fi of f.items ?? []) {
      if (!fi?.line_item_id) continue
      const li = lineMap.get(fi.line_item_id)
      const variantId: string | undefined = li?.variant_id
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
        product_title: inv.product_title ?? li?.title ?? fi.title ?? null,
        reference_id: data.fulfillment_id,
        reason: "Sipariş kargo hazırlığı (fulfillment)",
      })

      void maybeAlertLowStock(container, {
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
