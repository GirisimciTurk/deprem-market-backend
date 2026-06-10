import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendReturnStatusEmail } from "../lib/return-mail"

/**
 * Müşteri (veya admin) iade talebi oluşturduğunda "İade Talebiniz Alındı" e-postası gönderir.
 * Event: `order.return_requested` (OrderWorkflowEvents.RETURN_REQUESTED).
 * Payload: `{ order_id, return_id }`.
 */
export default async function returnRequestedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; return_id: string }>) {
  await sendReturnStatusEmail(container, data.return_id, "requested")
}

export const config: SubscriberConfig = {
  event: "order.return_requested",
}
