import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

const num = (v: any) => Number(v ?? 0)

type ReturnedLine = {
  product_id: string
  title: string
  quantity: number
  unit_price: number
  line_total: number
}

/**
 * Native Medusa return'ünü satıcı bazında gruplar. Her iade kalemini, siparişin
 * seller_order'larındaki product_id ile eşleştirerek doğru satıcıya/seller_order'a
 * atar. `useReceived=true` ise received_quantity, değilse requested quantity kullanır.
 */
async function groupReturnBySeller(container: any, returnId: string, useReceived: boolean) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)

  const { data: returns } = await query.graph({
    entity: "return",
    fields: [
      "id",
      "status",
      "order.id",
      "order.email",
      "order.display_id",
      "order.currency_code",
      "items.quantity",
      "items.received_quantity",
      "items.item.product_id",
      "items.item.title",
      "items.item.unit_price",
    ],
    filters: { id: returnId },
  })
  const ret = returns?.[0] as any
  if (!ret?.order?.id) return null

  const orderId = ret.order.id
  const sellerOrders = await marketplace.listSellerOrders({ order_id: orderId }, { take: 100 })
  if (sellerOrders.length === 0) return null

  // product_id → { sellerOrder, commission_rate }
  const productMap = new Map<string, { so: any; commission_rate: number }>()
  for (const so of sellerOrders as any[]) {
    for (const it of (so.items as any[]) || []) {
      if (it.product_id) productMap.set(it.product_id, { so, commission_rate: num(so.commission_rate) })
    }
  }

  // seller_order.id → { seller_id, so, lines[], returned_subtotal/commission/earning }
  const groups = new Map<string, any>()
  for (const ri of (ret.items as any[]) || []) {
    const productId = ri.item?.product_id
    if (!productId) continue
    const match = productMap.get(productId)
    if (!match) continue
    const qty = useReceived ? num(ri.received_quantity ?? ri.quantity) : num(ri.quantity)
    if (qty <= 0) continue
    const unitPrice = num(ri.item?.unit_price)
    const lineTotal = unitPrice * qty
    const commission = Math.round((lineTotal * match.commission_rate) / 100)

    const key = match.so.id
    if (!groups.has(key)) {
      groups.set(key, {
        seller_order: match.so,
        seller_id: match.so.seller_id,
        commission_rate: match.commission_rate,
        lines: [] as ReturnedLine[],
        returned_subtotal: 0,
        returned_commission: 0,
        returned_earning: 0,
      })
    }
    const g = groups.get(key)
    g.lines.push({ product_id: productId, title: ri.item?.title, quantity: qty, unit_price: unitPrice, line_total: lineTotal })
    g.returned_subtotal += lineTotal
    g.returned_commission += commission
    g.returned_earning += lineTotal - commission
  }

  return { ret, orderId, groups }
}

export type RequestedItem = {
  id: string // order line item id
  quantity: number
  reason_id?: string | null
  note?: string | null
}

export type SellerItemGroup = {
  seller_id: string | null
  seller_order_id: string | null
  items: RequestedItem[]
}

/**
 * Bir iade talebinin order line item'larını satıcıya göre gruplar (iade
 * OLUŞTURULURKEN her satıcı için ayrı native return açmak için). Her order kalemi
 * product_id ile siparişin seller_order'larına eşlenir. Eşleşmeyen kalemler
 * tek bir `seller_id:null` grubuna düşer (admin-yönetimli fallback return).
 */
export async function groupRequestedItemsBySeller(
  container: any,
  orderId: string,
  requestedItems: RequestedItem[]
): Promise<SellerItemGroup[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)

  // order line item id → product_id
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "items.id", "items.product_id"],
    filters: { id: orderId },
  })
  const order = orders?.[0] as any
  const lineToProduct = new Map<string, string>()
  for (const it of (order?.items as any[]) || []) {
    if (it?.id && it?.product_id) lineToProduct.set(String(it.id), String(it.product_id))
  }

  // product_id → seller_order
  const sellerOrders = await marketplace.listSellerOrders({ order_id: orderId }, { take: 100 })
  const productToSeller = new Map<string, { seller_id: string; seller_order_id: string }>()
  for (const so of sellerOrders as any[]) {
    for (const it of (so.items as any[]) || []) {
      if (it?.product_id)
        productToSeller.set(String(it.product_id), { seller_id: so.seller_id, seller_order_id: so.id })
    }
  }

  // groupKey (seller_order_id | "_unassigned") → group
  const groups = new Map<string, SellerItemGroup>()
  for (const ri of requestedItems) {
    const productId = lineToProduct.get(String(ri.id))
    const match = productId ? productToSeller.get(productId) : undefined
    const key = match?.seller_order_id ?? "_unassigned"
    if (!groups.has(key)) {
      groups.set(key, {
        seller_id: match?.seller_id ?? null,
        seller_order_id: match?.seller_order_id ?? null,
        items: [],
      })
    }
    groups.get(key)!.items.push(ri)
  }

  return [...groups.values()]
}

/**
 * order.return_requested: satıcı(lar) için "requested" seller_return kayıtları
 * oluşturur (satıcı panelinde görünmesi için). seller_order'a DOKUNMAZ.
 * İdempotent: bu return için kayıt varsa atlar.
 */
export async function routeReturnRequested(container: any, returnId: string): Promise<number> {
  const logger = container.resolve("logger")
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)

  const existing = await marketplace.listSellerReturns({ return_id: returnId }, { take: 1 })
  if (existing.length > 0) {
    logger.info(`[return-route] ${returnId} zaten yönlendirilmiş, atlanıyor.`)
    return 0
  }

  const grouped = await groupReturnBySeller(container, returnId, false)
  if (!grouped || grouped.groups.size === 0) return 0
  const { ret, orderId } = grouped

  const rows = [...grouped.groups.values()].map((g: any) => ({
    seller_id: g.seller_id,
    return_id: returnId,
    order_id: orderId,
    seller_order_id: g.seller_order.id,
    display_id: ret.order.display_id ? String(ret.order.display_id) : null,
    customer_email: ret.order.email || null,
    currency_code: ret.order.currency_code || "try",
    status: "requested",
    items: g.lines,
    returned_subtotal: g.returned_subtotal,
    returned_commission: g.returned_commission,
    returned_earning: g.returned_earning,
  }))

  await marketplace.createSellerReturns(rows as any)
  logger.info(`[return-route] ${returnId} → ${rows.length} satıcı iadesi (requested).`)
  return rows.length
}

/**
 * order.return_received: iadeyi "received" yapar, komisyon/kazancı geri alır ve
 * ilgili seller_order'ların returned_* agregalarını artırır (net payout düşer).
 * İdempotent: zaten received olan seller_return'ler tekrar işlenmez.
 */
export async function routeReturnReceived(container: any, returnId: string): Promise<number> {
  const logger = container.resolve("logger")
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)

  const grouped = await groupReturnBySeller(container, returnId, true)
  if (!grouped || grouped.groups.size === 0) return 0
  const { ret, orderId } = grouped

  const existing = await marketplace.listSellerReturns({ return_id: returnId }, { take: 100 })
  const bySellerOrder = new Map(existing.map((r: any) => [r.seller_order_id, r]))
  const receivedAt = new Date()
  let applied = 0

  for (const g of grouped.groups.values() as any) {
    const prior = bySellerOrder.get(g.seller_order.id) as any
    if (prior?.status === "received") {
      continue // zaten işlenmiş → çift reversal'ı önle
    }

    // seller_return kaydını güncelle/oluştur
    if (prior) {
      await marketplace.updateSellerReturns({
        id: prior.id,
        status: "received",
        items: g.lines,
        returned_subtotal: g.returned_subtotal,
        returned_commission: g.returned_commission,
        returned_earning: g.returned_earning,
        received_at: receivedAt,
      } as any)
    } else {
      await marketplace.createSellerReturns({
        seller_id: g.seller_id,
        return_id: returnId,
        order_id: orderId,
        seller_order_id: g.seller_order.id,
        display_id: ret.order.display_id ? String(ret.order.display_id) : null,
        customer_email: ret.order.email || null,
        currency_code: ret.order.currency_code || "try",
        status: "received",
        items: g.lines,
        returned_subtotal: g.returned_subtotal,
        returned_commission: g.returned_commission,
        returned_earning: g.returned_earning,
        received_at: receivedAt,
      } as any)
    }

    // seller_order agregalarını ARTIR (mevcut iadelerin üstüne ekle)
    const so = g.seller_order
    await marketplace.updateSellerOrders({
      id: so.id,
      returned_subtotal: num(so.returned_subtotal) + g.returned_subtotal,
      returned_commission: num(so.returned_commission) + g.returned_commission,
      returned_earning: num(so.returned_earning) + g.returned_earning,
    } as any)
    applied++
  }

  logger.info(`[return-route] ${returnId} → ${applied} satıcı iadesi received + komisyon reversal.`)
  return applied
}
