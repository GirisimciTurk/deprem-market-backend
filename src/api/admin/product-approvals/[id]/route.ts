import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

const schema = z.object({
  action: z.enum(["publish", "reject"]),
})

/**
 * POST /admin/product-approvals/:id  { action: "publish" | "reject" }
 * Satıcı ürününü yayına alır (published) veya reddeder (rejected).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz işlem (publish|reject)." })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "seller.id"],
    filters: { id: req.params.id },
  })
  const product = data?.[0] as any
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })
  if (!product.seller?.id) {
    return res.status(400).json({ message: "Bu ürün bir satıcıya ait değil." })
  }

  const status = parsed.data.action === "publish" ? "published" : "rejected"
  await updateProductsWorkflow(req.scope).run({
    input: { products: [{ id: product.id, status: status as any }] },
  })

  return res.json({ id: product.id, status })
}
