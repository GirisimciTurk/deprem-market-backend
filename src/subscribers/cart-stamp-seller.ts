import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { LINE_SHIP_META_KEY, LineShipMeta } from "../lib/cart-cargo"

/**
 * Sepet her güncellendiğinde, her kalemin `metadata.dt_ship`'ine ürünün
 * SATICISINI ve satıcının ücretsiz kargo eşiğini damgalar. Neden gerekli:
 * desi-bazlı MÜŞTERİ kargosunu hesaplayan fulfillment provider (calculatePrice)
 * izole modüldür — query/marketplace çözemez, yalnızca kalem context'ini görür.
 * Satıcı bilgisini buradan (ana container, query erişimli) kaleme yazarız ki
 * provider checkout'ta her satıcının kargosunu + ücretsiz kuralını uygulayabilsin.
 *
 * İdempotent: yalnızca eksik/değişmiş kalemleri günceller (sonsuz döngü yok —
 * modül seviyesinde update cart.updated event'i YAYINLAMAZ).
 */
export default async function stampCartSellerHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const cartId = (data as any)?.id
  if (!cartId) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const cartModule: any = container.resolve(Modules.CART)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: cartId },
      fields: ["id", "items.id", "items.product_id", "items.metadata"],
    })
    const items: any[] = carts?.[0]?.items ?? []
    if (items.length === 0) return

    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))]
    const sellerByProduct = new Map<string, LineShipMeta>()
    if (productIds.length > 0) {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "seller.id", "seller.free_shipping_threshold"],
        filters: { id: productIds },
      })
      for (const p of products as any[]) {
        sellerByProduct.set(p.id, {
          s: p.seller?.id ?? null,
          f: p.seller?.free_shipping_threshold ?? null,
        })
      }
    }

    const updates: { id: string; metadata: Record<string, unknown> }[] = []
    for (const it of items) {
      const info: LineShipMeta = sellerByProduct.get(it.product_id) ?? { s: null, f: null }
      const cur = (it.metadata as any)?.[LINE_SHIP_META_KEY]
      if (!cur || cur.s !== info.s || cur.f !== info.f) {
        updates.push({
          id: it.id,
          metadata: { ...(it.metadata || {}), [LINE_SHIP_META_KEY]: info },
        })
      }
    }

    if (updates.length > 0) {
      await cartModule.updateLineItems(updates)
    }
  } catch (e: any) {
    logger.warn(`[cart-stamp-seller] ${cartId} damgalanamadı: ${e?.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
