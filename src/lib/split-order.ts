import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { notifySeller } from "./notify"
import { readCargoTariff, computeDesi, computeCargoFee } from "./cargo-fee"

/**
 * Bir müşteri siparişini satıcı bazında alt-siparişlere (seller_order) böler ve
 * komisyonu KALEM bazında hesaplar: her ürünün komisyon oranı, ürünün kategorisine
 * ait kategori-komisyon kuralı varsa o orandan; yoksa satıcının sabit oranından
 * (house = %0) gelir. seller_order.commission_rate efektif (harmanlanmış) orandır.
 * İdempotent. order.placed subscriber'ı ve setup/test bunu paylaşır.
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

  // Kategori → komisyon oranı haritası.
  const rules = await marketplace.listCommissionRules({}, { take: 1000 })
  const categoryRate = new Map<string, number>(
    (rules as any[]).map((r) => [r.category_id, Number(r.rate ?? 0)])
  )

  // Ürün → { seller, is_house, sellerRate, categories }
  const productIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))]
  const productInfo = new Map<
    string,
    { sellerId: string; isHouse: boolean; sellerRate: number; categoryIds: string[] }
  >()
  // Ürün → birim ağırlık (gram); kargo desi'si için.
  const productWeight = new Map<string, number>()
  if (productIds.length > 0) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "weight", "seller.id", "seller.commission_rate", "seller.is_house", "categories.id"],
      filters: { id: productIds },
    })
    for (const p of products as any[]) {
      if (p.seller?.id) {
        productInfo.set(p.id, {
          sellerId: p.seller.id,
          isHouse: !!p.seller.is_house,
          sellerRate: Number(p.seller.commission_rate ?? 0),
          categoryIds: (p.categories || []).map((c: any) => c.id),
        })
      }
      productWeight.set(p.id, Number(p.weight ?? 0))
    }
  }

  // Satıcısı belirsiz kalemler için house.
  const [houseSeller] = await marketplace.listSellers({ is_house: true }, { take: 1 })
  const house = houseSeller
    ? { sellerId: (houseSeller as any).id, isHouse: true, sellerRate: 0, categoryIds: [] as string[] }
    : null

  // Bir kalem için efektif komisyon oranı: house→0; kategori kuralı varsa (birden
  // çoksa en yükseği); yoksa satıcı sabit oranı.
  const rateForItem = (info: { isHouse: boolean; sellerRate: number; categoryIds: string[] }) => {
    if (info.isHouse) return 0
    const catRates = info.categoryIds.map((c) => categoryRate.get(c)).filter((r): r is number => r != null)
    if (catRates.length > 0) return Math.max(...catRates)
    return info.sellerRate
  }

  const num = (v: any) => Number(v ?? 0)
  // Satıcıya göre grupla; her kaleme efektif oranı iliştir.
  const groups = new Map<string, { items: { it: any; rate: number }[] }>()
  for (const it of items) {
    const info = (it.product_id && productInfo.get(it.product_id)) || house
    if (!info) {
      logger.warn(`[splitOrder] ${orderId}: kalem ${it.id} için satıcı yok, atlanıyor.`)
      continue
    }
    if (!groups.has(info.sellerId)) groups.set(info.sellerId, { items: [] })
    groups.get(info.sellerId)!.items.push({ it, rate: rateForItem(info) })
  }
  if (groups.size === 0) return 0

  // Kargo tarifesi (desi-bazlı, satıcı maliyeti) — bir kez oku.
  const cargoTariff = await readCargoTariff(container)

  const currency = order.currency_code || "try"
  const sellerOrders = [...groups.entries()].map(([sellerId, g]) => {
    // Bu satıcıya düşen toplam ağırlık → desi → kargo ücreti (kuruş).
    const totalGrams = g.items.reduce(
      (s, { it }) => s + num(productWeight.get(it.product_id) ?? 0) * num(it.quantity),
      0
    )
    const cargo_fee = computeCargoFee(cargoTariff, computeDesi(totalGrams))
    const snapshot = g.items.map(({ it, rate }) => {
      const line_total = num(it.unit_price) * num(it.quantity)
      return {
        product_id: it.product_id,
        title: it.title,
        variant_title: it.variant_title,
        quantity: num(it.quantity),
        unit_price: num(it.unit_price),
        line_total,
        commission_rate: rate,
        commission_amount: Math.round((line_total * rate) / 100),
        thumbnail: it.thumbnail,
      }
    })
    const subtotal = snapshot.reduce((s, x) => s + x.line_total, 0)
    const commission_amount = snapshot.reduce((s, x) => s + x.commission_amount, 0)
    // Efektif (harmanlanmış) oran — gösterim için.
    const effectiveRate = subtotal > 0 ? Math.round((commission_amount / subtotal) * 100 * 100) / 100 : 0
    return {
      seller_id: sellerId,
      order_id: orderId,
      display_id: order.display_id ? String(order.display_id) : null,
      customer_email: order.email || null,
      currency_code: currency,
      subtotal,
      commission_rate: effectiveRate,
      commission_amount,
      seller_earning: subtotal - commission_amount,
      cargo_fee,
      item_count: snapshot.reduce((s, x) => s + x.quantity, 0),
      items: snapshot,
      shipping_address: order.shipping_address || null,
    }
  })

  await marketplace.createSellerOrders(sellerOrders as any)
  logger.info(`[splitOrder] ${orderId} → ${sellerOrders.length} alt-sipariş.`)

  // Her satıcıya "yeni sipariş" panel-içi bildirimi (best-effort).
  const displayId = order.display_id ? `#${order.display_id}` : ""
  for (const so of sellerOrders) {
    await notifySeller(container, so.seller_id, {
      type: "order",
      title: `Yeni sipariş ${displayId}`.trim(),
      body: `${so.item_count} ürün — toplam ${(so.subtotal / 100).toFixed(2)} ₺`,
      link: "/orders",
    })
  }
  return sellerOrders.length
}
