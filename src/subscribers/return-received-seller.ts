import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { routeReturnReceived } from "../lib/process-return"

type ReturnEvent = { return_id: string; order_id?: string }

/**
 * İade teslim alındığında: seller_return'ü "received" yapar ve iade edilen
 * kalemlerin komisyon/kazancını geri alır (seller_order.returned_* artar →
 * satıcının ödenecek net bakiyesi düşer). İdempotent.
 */
export default async function returnReceivedSellerHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnEvent>) {
  if (!data?.return_id) return
  try {
    await routeReturnReceived(container, data.return_id)
  } catch (e: any) {
    container.resolve("logger").error(`[return-received-seller] ${data.return_id}: ${e.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.return_received",
}
