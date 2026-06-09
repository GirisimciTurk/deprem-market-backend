import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendCargoStatusEmail } from "../lib/cargo-mail"

/**
 * Sipariş kargoya verildiğinde müşteriye "Kargoya Verildi" e-postası gönderir.
 *
 * NOT: Medusa'nın gerçek event adı `shipment.created` (eski kod yanlışlıkla
 * `order.shipment.created` dinliyordu → mail hiç gitmiyordu). Payload yalnızca
 * `{ id: <shipment/fulfillment id> }` içerir; order, fulfillment id'den çözülür.
 */
export default async function orderShipmentHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await sendCargoStatusEmail(container, data.id, "shipped")
}

export const config: SubscriberConfig = {
  event: "shipment.created",
}
