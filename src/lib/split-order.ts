import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { notifySeller } from "./notify"
import { readCargoTariff, computeCargoFee, unitDesi, pickDims, DimInput } from "./cargo-fee"

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
  // Kargo desi'si için ham boyut/ağırlık (cm + gram). VARYANT boyutu öncelikli,
  // ürün boyutu fallback (pickDims; müşteri kargo yollarıyla tutarlı). Önce ürün-seviyesi.
  const productDims = new Map<string, DimInput>()
  // Sipariş ANINDAKİ KDV oranı snapshot'ı (e-fatura için): sonradan ürünün KDV'si
  // değişse bile bu siparişin faturası ödendiği andaki oranı kullansın (immutable).
  const productVat = new Map<string, number | null>()
  if (productIds.length > 0) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id", "weight", "length", "width", "height", "metadata",
        "seller.id", "seller.commission_rate", "seller.is_house", "categories.id",
      ],
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
      productDims.set(p.id, { weight: p.weight, length: p.length, width: p.width, height: p.height })
      const vr = (p.metadata as any)?.vat_rate
      productVat.set(p.id, vr != null && !Number.isNaN(Number(vr)) ? Number(vr) : null)
    }
  }

  // Varyant-seviyesi boyut (varsa ürün boyutunu ezer) — farklı bedenler farklı desi.
  const variantDims = new Map<string, DimInput>()
  const lineVariantIds = [...new Set(items.map((it) => it.variant_id).filter(Boolean))]
  if (lineVariantIds.length > 0) {
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: ["id", "weight", "length", "width", "height"],
      filters: { id: lineVariantIds },
    })
    for (const v of variants as any[]) {
      variantDims.set(v.id, { weight: v.weight, length: v.length, width: v.width, height: v.height })
    }
  }

  // Bir kalem için efektif desi boyutu: varyant değeri varsa onu, yoksa ürünü kullan.
  const dimsForItem = (it: any) =>
    pickDims(it.variant_id ? variantDims.get(it.variant_id) : null, productDims.get(it.product_id))

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
    // Bu satıcıya düşen toplam desi → kargo ücreti (kuruş). Her kalem için birim
    // desi = max(hacimsel desi [en×boy×yük/3000], ağırlık [kg]); adetle çarpılıp
    // toplanır. Boyut girilmemiş ürünlerde otomatik ağırlığa düşer.
    const totalDesi = g.items.reduce((s, { it }) => {
      return s + unitDesi(dimsForItem(it)) * num(it.quantity)
    }, 0)
    const cargo_fee = computeCargoFee(cargoTariff, totalDesi)
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
        // Sipariş-anı KDV oranı (e-fatura immutability). null → e-fatura canlı
        // metadata'ya/config default'una düşer (eski siparişler için geriye uyumlu).
        vat_rate: it.product_id ? productVat.get(it.product_id) ?? null : null,
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
      // Hibrit kargo: split anında varsayılan/anlaşmalı (Yurtiçi) kabul edilir →
      // cargo_fee = platform ücreti. Satıcı kendi kargosuyla kargolarsa fulfill
      // anında cargo_fee 0'a çekilir; platform_cargo_fee sabit kalır.
      cargo_fee,
      platform_cargo_fee: cargo_fee,
      item_count: snapshot.reduce((s, x) => s + x.quantity, 0),
      items: snapshot,
      shipping_address: order.shipping_address || null,
    }
  })

  try {
    await marketplace.createSellerOrders(sellerOrders as any)
  } catch (e: any) {
    // (order_id, seller_id) unique index → eşzamanlı ikinci order.placed çift bölmeyi
    // burada yakalar (app-içi kontrol race'i kaçırırsa DB son savunma hattı).
    if (/unique|duplicate|UQ_seller_order/i.test(e?.message || "")) {
      logger.warn(`[splitOrder] ${orderId} eşzamanlı çift bölme engellendi (unique).`)
      return 0
    }
    throw e
  }
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
