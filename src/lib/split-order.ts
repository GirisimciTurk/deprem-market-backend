import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

/**
 * Bir müşteri siparişini satıcı bazında alt-siparişlere (seller_order) böler ve
 * komisyonu anlık hesaplar. İdempotent: sipariş zaten bölünmüşse 0 döner.
 * order.placed subscriber'ı ve test/yeniden-işleme script'leri bunu paylaşır.
 *
 * @returns oluşturulan seller_order sayısı
 */
export async function splitOrder(container: any, orderId: string): Promise<number> {
  const logger = container.resolve("logger")
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const existing = await marketplace.listSellerOrders({ order_id: orderId }, { take: 1 })
  if (existing.length > 0) {
    logger.info(`[splitOrder] ${orderId} zaten bölünmüş, atlanıyor.`)
    return 0
  }

  const orderModuleService = container.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, {
      relations: ["items", "shipping_address"],
    })
  } catch (err: any) {
    logger.error(`[splitOrder] Sipariş bulunamadı: ${orderId} (${err.message})`)
    return 0
  }

  const items: any[] = order.items || []
  if (items.length === 0) return 0

  const productIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))]
  const productSeller = new Map<string, { id: string; commission_rate: number }>()
  if (productIds.length > 0) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "seller.id", "seller.commission_rate"],
      filters: { id: productIds },
    })
    for (const p of products as any[]) {
      if (p.seller?.id) {
        productSeller.set(p.id, {
          id: p.seller.id,
          commission_rate: Number(p.seller.commission_rate ?? 0),
        })
      }
    }
  }

  let house: { id: string; commission_rate: number } | null = null
  const [houseSeller] = await marketplace.listSellers({ is_house: true }, { take: 1 })
  if (houseSeller) {
    house = { id: houseSeller.id, commission_rate: Number(houseSeller.commission_rate ?? 0) }
  }

  const num = (v: any) => Number(v ?? 0)
  const groups = new Map<string, { commission_rate: number; items: any[] }>()
  for (const it of items) {
    const s = (it.product_id && productSeller.get(it.product_id)) || house
    if (!s) {
      logger.warn(`[splitOrder] ${orderId}: kalem ${it.id} için satıcı yok, atlanıyor.`)
      continue
    }
    if (!groups.has(s.id)) groups.set(s.id, { commission_rate: s.commission_rate, items: [] })
    groups.get(s.id)!.items.push(it)
  }
  if (groups.size === 0) return 0

  const currency = order.currency_code || "try"
  const sellerOrders = [...groups.entries()].map(([sellerId, g]) => {
    const snapshot = g.items.map((it) => ({
      product_id: it.product_id,
      title: it.title,
      variant_title: it.variant_title,
      quantity: num(it.quantity),
      unit_price: num(it.unit_price),
      line_total: num(it.unit_price) * num(it.quantity),
      thumbnail: it.thumbnail,
    }))
    const subtotal = snapshot.reduce((s, x) => s + x.line_total, 0)
    const commission_amount = Math.round((subtotal * g.commission_rate) / 100)
    return {
      seller_id: sellerId,
      order_id: orderId,
      display_id: order.display_id ? String(order.display_id) : null,
      customer_email: order.email || null,
      currency_code: currency,
      subtotal,
      commission_rate: g.commission_rate,
      commission_amount,
      seller_earning: subtotal - commission_amount,
      item_count: snapshot.reduce((s, x) => s + x.quantity, 0),
      items: snapshot,
      shipping_address: order.shipping_address || null,
    }
  })

  await marketplace.createSellerOrders(sellerOrders as any)
  logger.info(`[splitOrder] ${orderId} → ${sellerOrders.length} alt-sipariş.`)
  return sellerOrders.length
}
