import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"

/** Toplu yüklemede SKU eşleşince güncellenecek mevcut ürünün çözülmüş kimlikleri. */
export type UpdateTarget = {
  productId: string
  variantId?: string | null
  invItemId?: string | null
  metadata?: Record<string, unknown> | null
}

/** Tek-varyant güncelleme girdisi (toplu satırından üretilir). Verilmeyen alanlar değişmez. */
export type UpdateVendorInput = {
  title?: string
  subtitle?: string | null
  description?: string | null
  material?: string | null
  price?: number
  original_price?: number | null
  vat_rate?: number | null
  delivery_days?: number | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  stock?: number | null
  barcode?: string | null
  brand_id?: string | null
  category_ids?: string[] | null
  images?: string[] | null
  thumbnail?: string | null
  tags?: string[] | null
}

/**
 * Mevcut bir satıcı ürününü (tek-varyant) günceller — toplu yüklemede SKU eşleşince
 * kopya oluşturmak yerine günceller. SADECE verilen alanlar değişir; metadata MERGE
 * edilir (mevcut alanlar korunur). SKU eşleşme anahtarı olduğu için değiştirilmez.
 * Tek-ürün düzenleme ucundaki (vendors/products/[id]) tek-varyant mantığını izler.
 */
export async function updateVendorProduct(
  scope: any,
  target: UpdateTarget,
  input: UpdateVendorInput
) {
  const update: Record<string, unknown> = { id: target.productId }
  if (input.title != null) update.title = input.title
  if (input.subtitle != null) update.subtitle = input.subtitle
  if (input.description != null) update.description = input.description
  if (input.material != null) update.material = input.material
  if (input.weight != null) update.weight = input.weight
  if (input.length != null) update.length = input.length
  if (input.width != null) update.width = input.width
  if (input.height != null) update.height = input.height
  if (input.category_ids && input.category_ids.length > 0) update.category_ids = input.category_ids

  // Görseller verilmişse galeri+thumbnail değişir; verilmemişse mevcut korunur.
  const imageUrls = (input.images ?? []).map((u) => (u || "").trim()).filter(Boolean)
  if (imageUrls.length > 0) {
    update.images = imageUrls.map((url) => ({ url }))
    update.thumbnail = imageUrls[0]
  } else if (input.thumbnail) {
    update.thumbnail = input.thumbnail
    update.images = [{ url: input.thumbnail }]
  }

  // metadata MERGE — yalnız verilen alanları değiştir.
  const metadata = { ...((target.metadata ?? {}) as Record<string, unknown>) }
  let metaChanged = false
  if (input.tags !== undefined) {
    const t = (input.tags ?? []).filter(Boolean)
    if (t.length > 0) metadata.tags = t
    else delete metadata.tags
    metaChanged = true
  }
  if (input.original_price !== undefined) {
    if (input.original_price && input.price != null && input.original_price > input.price) {
      metadata.compare_at_price = input.original_price
    } else {
      delete metadata.compare_at_price
    }
    metaChanged = true
  }
  if (input.brand_id !== undefined) {
    if (input.brand_id) metadata.brand_id = input.brand_id
    else delete metadata.brand_id
    metaChanged = true
  }
  if (input.vat_rate != null && !Number.isNaN(Number(input.vat_rate))) {
    metadata.vat_rate = Number(input.vat_rate)
    metaChanged = true
  }
  if (input.delivery_days != null && !Number.isNaN(Number(input.delivery_days))) {
    metadata.delivery_days = Math.max(0, Math.floor(Number(input.delivery_days)))
    metaChanged = true
  }
  if (metaChanged) update.metadata = metadata

  await updateProductsWorkflow(scope).run({ input: { products: [update as any] } })

  // Varyant: fiyat + barkod (SKU eşleşme anahtarı → değiştirilmez).
  if (target.variantId && (input.price != null || input.barcode != null)) {
    const variantUpdate: Record<string, unknown> = {}
    if (input.price != null) {
      variantUpdate.prices = [{ amount: Math.round(Number(input.price) * 100), currency_code: "try" }]
    }
    if (input.barcode != null) variantUpdate.barcode = input.barcode || null
    await updateProductVariantsWorkflow(scope).run({
      input: { selector: { id: target.variantId }, update: variantUpdate as any },
    })
  }

  // Stok: verilmişse varsayılan lokasyon seviyesini ayarla (yoksa aç).
  if (input.stock != null && target.invItemId) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const inventory = scope.resolve(Modules.INVENTORY)
    const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
    const locationId = locations?.[0]?.id
    if (locationId) {
      const qty = Math.max(0, Math.floor(Number(input.stock)))
      const existing = await inventory.listInventoryLevels({
        inventory_item_id: target.invItemId,
        location_id: locationId,
      })
      if (existing.length > 0) {
        await inventory.updateInventoryLevels([
          { inventory_item_id: target.invItemId, location_id: locationId, stocked_quantity: qty },
        ])
      } else {
        await inventory.createInventoryLevels([
          { inventory_item_id: target.invItemId, location_id: locationId, stocked_quantity: qty },
        ])
      }
    }
  }

  return { id: target.productId, updated: true }
}
