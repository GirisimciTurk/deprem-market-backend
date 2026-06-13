import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { recordMovement, resolveVariantInventory, getLevel } from "./stock-movement"

/**
 * İade teslim alındığında (Medusa managed-inventory stoğu otomatik geri eklemiştir)
 * her kalem için bir "return" stok hareketi yazar — denetim izi (Stok Geçmişi) için.
 * Best-effort; stok SEVİYESİNİ değiştirmez, yalnızca hareket kaydı ekler.
 */
export async function recordReturnStockMovements(container: any, returnId: string) {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: returns } = await query.graph({
      entity: "return",
      fields: [
        "location_id",
        "items.quantity",
        "items.received_quantity",
        "items.item.variant_id",
        "items.item.title",
        "items.item.product_title",
      ],
      filters: { id: returnId },
    })
    const r = returns?.[0]
    if (!r?.location_id) return

    for (const ri of r.items ?? []) {
      if (!ri) continue
      const variantId: string | null | undefined = ri.item?.variant_id
      // Teslim alınan miktar (yoksa talep edilen) kadar geri ekleme yapılmıştır.
      const qty = Number(ri.received_quantity ?? ri.quantity) || 0
      if (!variantId || qty <= 0) continue

      const inv = await resolveVariantInventory(container, variantId)
      if (!inv.inventory_item_id) continue

      const level = await getLevel(container, inv.inventory_item_id, r.location_id)
      await recordMovement(container, {
        inventory_item_id: inv.inventory_item_id,
        location_id: r.location_id,
        type: "return",
        quantity_delta: qty,
        resulting_quantity: level?.stocked_quantity ?? null,
        sku: inv.sku,
        product_title: inv.product_title ?? ri.item?.product_title ?? ri.item?.title ?? null,
        reference_id: returnId,
        reason: "İade teslim alındı (stok geri eklendi)",
      })
    }
  } catch {
    /* best-effort */
  }
}
