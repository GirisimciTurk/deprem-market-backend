import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"

function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "")
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "urun"
  )
}

export type VendorProductInput = {
  title: string
  description?: string | null
  /** Fiyat TRY, major birim (ör. 199.90) — kuruşa çevrilir. */
  price: number
  sku?: string | null
  barcode?: string | null
  thumbnail?: string | null
  weight?: number | null
  /** Açılış stoğu (adet). Verilirse varsayılan lokasyonda stok seviyesi açılır. */
  stock?: number | null
}

/**
 * Bir satıcı için tek bir ürün oluşturur (çift onay gereği "proposed" durumunda),
 * seller-product link'iyle satıcıya bağlar ve stok verildiyse varsayılan
 * lokasyonda envanter seviyesi açar. Hem tek-ürün ekleme (POST /vendors/products)
 * hem toplu yükleme (POST /vendors/products/bulk) bunu kullanır.
 *
 * benzersiz handle çakışmasını önlemek için handle'a satıcı handle'ı + ekisuffix
 * eklenir.
 */
export async function createVendorProduct(
  scope: any,
  sellerId: string,
  sellerHandle: string,
  input: VendorProductInput,
  handleSuffix?: string
) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const link = scope.resolve(ContainerRegistrationKeys.LINK)

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const shippingProfileId = profiles?.[0]?.id
  const salesChannelId = channels?.[0]?.id

  const amount = Math.round(input.price * 100)
  const base = slugify(input.title)
  const handle = `${base}-${sellerHandle}${handleSuffix ? `-${handleSuffix}` : ""}`

  const { result } = await createProductsWorkflow(scope).run({
    input: {
      products: [
        {
          title: input.title,
          description: input.description ?? undefined,
          handle,
          status: "proposed" as any,
          thumbnail: input.thumbnail ?? undefined,
          images: input.thumbnail ? [{ url: input.thumbnail }] : undefined,
          weight: input.weight ?? undefined,
          shipping_profile_id: shippingProfileId,
          options: [{ title: "Model", values: ["Standart"] }],
          variants: [
            {
              title: "Standart",
              sku: input.sku ?? undefined,
              barcode: input.barcode ?? undefined,
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
    [MARKETPLACE_MODULE]: { seller_id: sellerId },
    [Modules.PRODUCT]: { product_id: product.id },
  })

  // Açılış stoğu verildiyse varsayılan lokasyonda envanter seviyesi aç.
  const stock = input.stock != null ? Math.max(0, Math.floor(Number(input.stock))) : null
  if (stock != null) {
    const { data: created } = await query.graph({
      entity: "product",
      fields: ["id", "variants.inventory_items.inventory_item_id"],
      filters: { id: product.id },
    })
    const invItemId = (created?.[0] as any)?.variants?.[0]?.inventory_items?.[0]
      ?.inventory_item_id
    const { data: locations } = await query.graph({
      entity: "stock_location",
      fields: ["id"],
    })
    const locationId = locations?.[0]?.id
    if (invItemId && locationId) {
      await createInventoryLevelsWorkflow(scope).run({
        input: {
          inventory_levels: [
            {
              inventory_item_id: invItemId,
              location_id: locationId,
              stocked_quantity: stock,
            },
          ],
        },
      })
    }
  }

  return product
}
