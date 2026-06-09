import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendCargoStatusEmail } from "../lib/cargo-mail"

/**
 * Sipariş teslim edildiğinde müşteriye "Teslim Edildi" e-postası gönderir.
 * Event: `delivery.created` (FulfillmentWorkflowEvents.DELIVERY_CREATED).
 * Payload: `{ id: <fulfillment id> }`.
 */
export default async function orderDeliveredHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await sendCargoStatusEmail(container, data.id, "delivered")
}

export const config: SubscriberConfig = {
  event: "delivery.created",
}
