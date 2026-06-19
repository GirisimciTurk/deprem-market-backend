import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { ANALYTICS_MODULE } from "../modules/analytics"
import type AnalyticsModuleService from "../modules/analytics/service"

/**
 * order.placed → tek bir güvenilir `purchase` davranış olayı yazar (ciro/funnel
 * buradan beslenir, istemciden DEĞİL). Satın alınan ürünler `metadata.product_ids`
 * içinde tutulur — "görüntülenip alınmayan" ve "birlikte alınanlar" analizleri için.
 *
 * Mevcut order-placed.ts (mail/push) ile çakışmaz; ayrı subscriber, aynı event.
 */
type OrderPlacedEvent = { id: string }

export default async function analyticsOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  const orderId = data.id
  const logger = container.resolve("logger")

  const orderModuleService = container.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, { relations: ["items"] })
  } catch (err: any) {
    logger.error(`[analytics] order not found: ${orderId} (${err?.message})`)
    return
  }

  const num = (v: any) => Number(v ?? 0)
  const items = order.items || []
  const total = items.reduce((s: number, it: any) => s + num(it.unit_price) * num(it.quantity), 0)
  const qty = items.reduce((s: number, it: any) => s + num(it.quantity), 0)
  const productIds = items.map((it: any) => it.product_id).filter(Boolean)

  // Storefront checkout'ta sepet/sipariş metadata'sına anonim oturum kimliğini
  // damgalarsa funnel'ı misafir→üye boyunca birleştirebiliriz (best-effort).
  const sessionId = order.metadata?.analytics_session_id
    ? String(order.metadata.analytics_session_id)
    : null

  const analytics = container.resolve<AnalyticsModuleService>(ANALYTICS_MODULE)
  await analytics.createAnalyticsEvents([
    {
      type: "purchase",
      customer_id: order.customer_id || null,
      session_id: sessionId,
      product_id: null,
      value: total,
      quantity: qty,
      currency_code: order.currency_code || "try",
      metadata: {
        order_id: orderId,
        display_id: order.display_id,
        product_ids: productIds,
        item_count: items.length,
      },
    },
  ])
  logger.info(`[analytics] purchase kaydedildi: order #${order.display_id || orderId} (${productIds.length} ürün)`)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
