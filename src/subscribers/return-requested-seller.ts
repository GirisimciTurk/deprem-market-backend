import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { routeReturnRequested } from "../lib/process-return"

type ReturnEvent = { return_id: string; order_id?: string }

/**
 * İade talebini ilgili satıcı(lar)a yönlendirir: her satıcı için "requested"
 * seller_return oluşturur (satıcı panelinde "İadelerim"de görünür). Komisyon
 * geri alımı receive anında yapılır (bkz. return-received-seller.ts).
 */
export default async function returnRequestedSellerHandler({
  event: { data },
  container,
}: SubscriberArgs<ReturnEvent>) {
  if (!data?.return_id) return
  try {
    await routeReturnRequested(container, data.return_id)
  } catch (e: any) {
    container.resolve("logger").error(`[return-requested-seller] ${data.return_id}: ${e.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.return_requested",
}
