import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { splitOrder } from "../lib/split-order"
import { generateInvoicesForOrder } from "../lib/einvoice/generate"

type OrderPlacedEvent = { id: string }

/**
 * Çok-satıcılı sipariş bölme: order.placed anında siparişin kalemleri ürün→satıcı
 * link'ine göre gruplanır ve her satıcı için bir seller_order (alt-sipariş) üretilir.
 * Komisyon anlık hesaplanır. Bölme sonrası satıcı bazında taslak faturalar üretilir.
 * Mantık lib/split-order.ts + lib/einvoice/generate.ts'te (testlerle paylaşılır).
 */
export default async function orderSplitHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  await splitOrder(container, data.id)
  try {
    await generateInvoicesForOrder(container, data.id)
  } catch (e: any) {
    container.resolve("logger").error(`[order-split] fatura üretimi: ${e.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
