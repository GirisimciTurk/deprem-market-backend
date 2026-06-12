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
    fields: ["id", "status", "seller.id", "variants.id"],
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

  // Fiyat değişikliği: ilk varyantın TRY fiyatını güncelle.
  if (data.price !== undefined) {
    const variantId = product.variants?.[0]?.id
    if (variantId) {
      const productModule = req.scope.resolve(Modules.PRODUCT)
      await productModule.upsertProductVariants([
        {
          id: variantId,
          prices: [{ amount: Math.round(data.price * 100), currency_code: "try" }],
        } as any,
      ])
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
