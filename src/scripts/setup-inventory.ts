import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Tüm envanter kalemleri için stok lokasyonunda inventory_level oluşturur (idempotent).
 *
 * Neden: dev DB'de ürünlerin hiç stok seviyesi yoktu → manage_inventory=true
 * variant'lar sepete eklenemiyordu ("Sales channel ... is not associated with
 * any stock location for variant"). Bu script checkout'u açar.
 *
 * Çalıştırma:  npm run setup:inventory
 * Stok miktarı:  DEFAULT_STOCK_QUANTITY env (default 100).
 */
export default async function setupInventory({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const stockedQuantity = process.env.DEFAULT_STOCK_QUANTITY
    ? Number(process.env.DEFAULT_STOCK_QUANTITY)
    : 100

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })
  if (!stockLocations.length) {
    throw new Error("[setup-inventory] Stok lokasyonu bulunamadı.")
  }
  const location = stockLocations[0]

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku", "location_levels.location_id"],
  })

  // Bu lokasyonda henüz seviyesi olmayan kalemler.
  const missing = inventoryItems.filter(
    (item: any) =>
      !(item.location_levels || []).some(
        (l: any) => l.location_id === location.id
      )
  )

  if (!missing.length) {
    logger.info(
      `[setup-inventory] Tüm ${inventoryItems.length} kalemin '${location.name}' lokasyonunda seviyesi mevcut (atlanıyor).`
    )
    return
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: missing.map((item: any) => ({
        inventory_item_id: item.id,
        location_id: location.id,
        stocked_quantity: stockedQuantity,
      })),
    },
  })

  logger.info(
    `[setup-inventory] ${missing.length} envanter kalemi için '${location.name}' lokasyonunda ${stockedQuantity} adet stok seviyesi oluşturuldu.`
  )
}
