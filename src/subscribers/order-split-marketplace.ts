import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { splitOrder } from "../lib/split-order"

type OrderPlacedEvent = { id: string }

/**
 * Çok-satıcılı sipariş bölme: order.placed anında siparişin kalemleri ürün→satıcı
 * link'ine göre gruplanır ve her satıcı için bir seller_order (alt-sipariş) üretilir.
 * Komisyon anlık hesaplanır. Mantık lib/split-order.ts'te (test ile paylaşılır).
 */
export default async function orderSplitHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  await splitOrder(container, data.id)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
