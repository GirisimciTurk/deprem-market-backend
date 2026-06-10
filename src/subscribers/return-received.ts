import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendReturnStatusEmail } from "../lib/return-mail"

/**
 * Admin iadeyi teslim alıp onayladığında (otomatik stok + ücret iadesi tetiklenir)
 * müşteriye "İadeniz Teslim Alındı" e-postası gönderir.
 * Event: `order.return_received` (OrderWorkflowEvents.RETURN_RECEIVED).
 * Payload: `{ order_id, return_id }`.
 */
export default async function returnReceivedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; return_id: string }>) {
  await sendReturnStatusEmail(container, data.return_id, "received")
}

export const config: SubscriberConfig = {
  event: "order.return_received",
}
