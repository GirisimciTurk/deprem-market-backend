import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"
import { STOCK_MOVEMENT_MODULE } from "../modules/stock_movement"
import type StockMovementModuleService from "../modules/stock_movement/service"

export type MovementType =
  | "sale"
  | "return"
  | "manual"
  | "transfer_in"
  | "transfer_out"
  | "count"
  | "initial"

export interface RecordMovementInput {
  inventory_item_id: string
  location_id: string
  type: MovementType
  quantity_delta: number
  resulting_quantity?: number | null
  sku?: string | null
  product_title?: string | null
  location_name?: string | null
  reason?: string | null
  reference_id?: string | null
  actor?: string | null
}

/** İşlemi yapan admin'in e-postasını çöz (yoksa id, o da yoksa null). */
export async function resolveActor(container: any, actorId?: string | null): Promise<string | null> {
  if (!actorId) return null
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "user",
      fields: ["email"],
      filters: { id: actorId },
    })
    return data?.[0]?.email ?? actorId
  } catch {
    return actorId
  }
}

/** Denormalize gösterim alanları (sku + ürün adı) için envanter kalemini çöz. Hata olursa null döner. */
export async function resolveItemInfo(
  container: any,
  inventoryItemId: string
): Promise<{ sku: string | null; product_title: string | null }> {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: ["sku", "variants.title", "variants.product.title"],
      filters: { id: inventoryItemId },
    })
    const item = data?.[0]
    const variant = item?.variants?.[0]
    return {
      sku: item?.sku ?? null,
      product_title: variant?.product?.title ?? variant?.title ?? null,
    }
  } catch {
    return { sku: null, product_title: null }
  }
}

/** Bir varyantın envanter kalemi id'si + sku + ürün adını çöz. Hata/bulunamazsa null'lar döner. */
export async function resolveVariantInventory(
  container: any,
  variantId: string
): Promise<{ inventory_item_id: string | null; sku: string | null; product_title: string | null }> {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "variant",
      fields: ["sku", "title", "product.title", "inventory_items.inventory_item_id"],
      filters: { id: variantId },
    })
    const v = data?.[0]
    return {
      inventory_item_id: v?.inventory_items?.[0]?.inventory_item_id ?? null,
      sku: v?.sku ?? null,
      product_title: v?.product?.title ?? v?.title ?? null,
    }
  } catch {
    return { inventory_item_id: null, sku: null, product_title: null }
  }
}

/** Lokasyon adını çöz (denormalize). */
export async function resolveLocationName(container: any, locationId: string): Promise<string | null> {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "stock_location",
      fields: ["name"],
      filters: { id: locationId },
    })
    return data?.[0]?.name ?? null
  } catch {
    return null
  }
}

/** Bir envanter kaleminin bir lokasyondaki mevcut seviyesi (yoksa null). */
export async function getLevel(
  container: any,
  inventoryItemId: string,
  locationId: string
): Promise<{ stocked_quantity: number; reserved_quantity: number } | null> {
  const inventory = container.resolve(Modules.INVENTORY)
  const levels = await inventory.listInventoryLevels({
    inventory_item_id: inventoryItemId,
    location_id: locationId,
  })
  const lvl = levels?.[0]
  if (!lvl) return null
  return {
    stocked_quantity: Number(lvl.stocked_quantity) || 0,
    reserved_quantity: Number(lvl.reserved_quantity) || 0,
  }
}

/**
 * Bir lokasyondaki stoklanan miktarı MUTLAK değere ayarlar (yoksa seviye oluşturur).
 * Hareket sonrası stoklanan miktarı döndürür.
 */
export async function setStockedQuantity(
  container: any,
  inventoryItemId: string,
  locationId: string,
  newStocked: number
): Promise<number> {
  const target = Math.max(0, Math.round(newStocked))
  const existing = await getLevel(container, inventoryItemId, locationId)
  if (existing) {
    await updateInventoryLevelsWorkflow(container).run({
      input: {
        updates: [
          { inventory_item_id: inventoryItemId, location_id: locationId, stocked_quantity: target },
        ],
      },
    })
  } else {
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: [
          { inventory_item_id: inventoryItemId, location_id: locationId, stocked_quantity: target },
        ],
      },
    })
  }
  return target
}

/**
 * Stok hareketini deftere yazar. ASLA throw etmez — kayıt başarısız olsa bile asıl akış
 * (sipariş, iade, stok güncelleme) kırılmaz; sadece loglanır.
 */
export async function recordMovement(container: any, input: RecordMovementInput): Promise<void> {
  try {
    const svc: StockMovementModuleService = container.resolve(STOCK_MOVEMENT_MODULE)
    // Idempotency: reference_id'li hareketlerde (satış/iade/transfer) event yeniden teslim
    // edilirse çift kayıt olmasın — aynı (reference_id + kalem + tür) varsa atla.
    if (input.reference_id) {
      const existing = await svc.listStockMovements({
        reference_id: input.reference_id,
        inventory_item_id: input.inventory_item_id,
        type: input.type,
      })
      if (existing?.length) return
    }
    await svc.createStockMovements({
      inventory_item_id: input.inventory_item_id,
      location_id: input.location_id,
      type: input.type,
      quantity_delta: Math.round(input.quantity_delta),
      resulting_quantity:
        input.resulting_quantity == null ? null : Math.round(input.resulting_quantity),
      sku: input.sku ?? null,
      product_title: input.product_title ?? null,
      location_name: input.location_name ?? null,
      reason: input.reason ?? null,
      reference_id: input.reference_id ?? null,
      actor: input.actor ?? null,
    })
  } catch (err) {
    try {
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
      logger.warn(`[stock-movement] Hareket kaydedilemedi: ${(err as Error)?.message}`)
    } catch {
      /* logger bile yoksa sessiz geç */
    }
  }
}
