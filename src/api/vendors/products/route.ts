import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { resolveSeller } from "../_lib/resolve-seller"

function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "")
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || `urun-${Date.now()}`
  )
}

/** GET /vendors/products?status=&q=&limit=&offset= — satıcının kendi ürünleri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Linked modül alanıyla (seller.id) DOĞRUDAN filtreleme query.graph'ta
  // desteklenmiyor; satıcı→ürün yönünden ürün id'lerini alıp ürünleri bu
  // id'lerle (core filtre) sorgularız.
  const { data: sellerRows } = await query.graph({
    entity: "seller",
    fields: ["products.id"],
    filters: { id: resolved.seller.id },
  })
  const productIds = ((sellerRows[0] as any)?.products ?? []).map((p: any) => p.id)
  if (productIds.length === 0) {
    return res.json({ products: [], count: 0, offset, limit })
  }

  const filters: Record<string, unknown> = { id: productIds }
  if (status) filters.status = status
  if (q) filters.title = { $ilike: `%${q}%` }

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "thumbnail",
      "handle",
      "created_at",
      "variants.id",
      "variants.sku",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    filters,
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })

  return res.json({ products, count: metadata?.count ?? products.length, offset, limit })
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  // Fiyat TRY, major birim (ör. 199.90) — kuruşa çevrilir.
  price: z.number().positive(),
  sku: z.string().optional().nullable(),
  thumbnail: z.string().url().optional().nullable(),
  weight: z.number().positive().optional(),
})

/**
 * POST /vendors/products — satıcı yeni ürün ekler. Çift onay gereği ürün
 * "proposed" durumunda oluşturulur (admin onaylayınca "published"). Yalnız aktif
 * satıcılar ürün ekleyebilir. Ürün, seller-product link'i ile satıcıya bağlanır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (resolved.seller.status !== "active") {
    return res.status(403).json({ message: "Yalnızca onaylı (aktif) satıcılar ürün ekleyebilir." })
  }

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz ürün verisi.", issues: parsed.error.issues })
  }
  const data = parsed.data

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const link = req.scope.resolve(ContainerRegistrationKeys.LINK)

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const shippingProfileId = profiles?.[0]?.id
  const salesChannelId = channels?.[0]?.id

  const amount = Math.round(data.price * 100)
  const { result } = await createProductsWorkflow(req.scope).run({
    input: {
      products: [
        {
          title: data.title,
          description: data.description ?? undefined,
          handle: `${slugify(data.title)}-${resolved.seller.handle}`,
          status: "proposed" as any,
          thumbnail: data.thumbnail ?? undefined,
          images: data.thumbnail ? [{ url: data.thumbnail }] : undefined,
          weight: data.weight ?? undefined,
          shipping_profile_id: shippingProfileId,
          options: [{ title: "Model", values: ["Standart"] }],
          variants: [
            {
              title: "Standart",
              sku: data.sku ?? undefined,
              options: { Model: "Standart" },
              manage_inventory: true,
              prices: [{ amount, currency_code: "try" }],
            },
          ],
          sales_channels: salesChannelId ? [{ id: salesChannelId }] : [],
        },
      ],
    },
  })

  const product = (result as any[])[0]

  // Ürünü satıcıya bağla (seller-product link).
  await link.create({
    [MARKETPLACE_MODULE]: { seller_id: resolved.seller.id },
    [Modules.PRODUCT]: { product_id: product.id },
  })

  return res.status(201).json({ product })
}
