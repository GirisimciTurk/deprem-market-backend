import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { resolveSeller } from "../../_lib/resolve-seller"

/** Ürünün bu satıcıya ait olup olmadığını doğrular. */
async function ownsProduct(req: MedusaRequest, productId: string, sellerId: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "status",
      "seller.id",
      "variants.id",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { id: productId },
  })
  const product = data?.[0] as any
  if (!product || product.seller?.id !== sellerId) return null
  return product
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  thumbnail: z.string().url().optional().nullable(),
  price: z.number().positive().optional(),
  weight: z.number().positive().optional(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  // Stok adedi — varsayılan lokasyondaki envanter seviyesi (yoksa açılır).
  stock: z.coerce.number().int().min(0).optional(),
})

/** POST /vendors/products/:id — satıcı kendi ürününü günceller. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const product = await ownsProduct(req, req.params.id, resolved.seller.id)
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })

  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const data = parsed.data

  const update: Record<string, unknown> = { id: product.id }
  if (data.title !== undefined) update.title = data.title
  if (data.description !== undefined) update.description = data.description
  if (data.thumbnail !== undefined) {
    update.thumbnail = data.thumbnail
    update.images = data.thumbnail ? [{ url: data.thumbnail }] : []
  }
  if (data.weight !== undefined) update.weight = data.weight

  await updateProductsWorkflow(req.scope).run({
    input: { products: [update as any] },
  })

  // Fiyat / SKU / barkod: ilk varyantı güncelle (tek-varyant ürün modeli).
  const variantId = product.variants?.[0]?.id
  if (variantId && (data.price !== undefined || data.sku !== undefined || data.barcode !== undefined)) {
    const productModule = req.scope.resolve(Modules.PRODUCT)
    const variantUpdate: Record<string, unknown> = { id: variantId }
    if (data.price !== undefined) {
      variantUpdate.prices = [{ amount: Math.round(data.price * 100), currency_code: "try" }]
    }
    if (data.sku !== undefined) variantUpdate.sku = data.sku || null
    if (data.barcode !== undefined) variantUpdate.barcode = data.barcode || null
    await productModule.upsertProductVariants([variantUpdate as any])
  }

  // Stok: varsayılan lokasyondaki envanter seviyesini güncelle (yoksa oluştur).
  if (data.stock !== undefined) {
    const invItemId = product.variants?.[0]?.inventory_items?.[0]?.inventory_item_id
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
    const locationId = locations?.[0]?.id
    if (invItemId && locationId) {
      const inventory = req.scope.resolve(Modules.INVENTORY)
      const existing = await inventory.listInventoryLevels({
        inventory_item_id: invItemId,
        location_id: locationId,
      })
      if (existing.length > 0) {
        await inventory.updateInventoryLevels([
          { inventory_item_id: invItemId, location_id: locationId, stocked_quantity: data.stock },
        ])
      } else {
        await inventory.createInventoryLevels([
          { inventory_item_id: invItemId, location_id: locationId, stocked_quantity: data.stock },
        ])
      }
    }
  }

  return res.json({ id: product.id, updated: true })
}

/** DELETE /vendors/products/:id — satıcı kendi ürününü siler. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const product = await ownsProduct(req, req.params.id, resolved.seller.id)
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })

  const productModule = req.scope.resolve(Modules.PRODUCT)
  await productModule.deleteProducts([product.id])
  return res.json({ id: product.id, object: "product", deleted: true })
}
