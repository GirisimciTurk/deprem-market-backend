import { model } from "@medusajs/framework/utils"

/**
 * Müşteri davranış olayı (first-party). Storefront tracker'dan `/store/track`
 * ile gelir; `purchase` YALNIZ sunucu tarafında (order.placed subscriber)
 * yazılır — istemciye güvenilmez, böylece ciro/funnel uydurulamaz.
 *
 * - `customer_id`: giriş yapmışsa dolu, misafirde null.
 * - `session_id`: her ziyaretçi için tarayıcıda üretilen anonim kimlik
 *   (giriş öncesi/sonrası davranışı birleştirmek için).
 * - Tutarlar `value` minor (kuruş) cinsindendir.
 */
export const EVENT_TYPES = [
  "product_view",
  "search",
  "add_to_cart",
  "remove_from_cart",
  "checkout_start",
  "purchase",
] as const

export type EventType = (typeof EVENT_TYPES)[number]

// İstemciden kabul edilen olaylar — `purchase` kasıtlı olarak dışarıda.
export const CLIENT_EVENT_TYPES = EVENT_TYPES.filter((t) => t !== "purchase")

const AnalyticsEvent = model.define("analytics_event", {
  id: model.id().primaryKey(),
  type: model.enum([...EVENT_TYPES]).index(),
  customer_id: model.text().index().nullable(),
  session_id: model.text().index().nullable(),
  product_id: model.text().index().nullable(),
  variant_id: model.text().nullable(),
  search_query: model.text().nullable(),
  results_count: model.number().nullable(),
  value: model.number().nullable(),
  quantity: model.number().nullable(),
  currency_code: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default AnalyticsEvent
