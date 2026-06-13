import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { recordReturnStockMovements } from "../lib/return-stock-audit"

/**
 * İade teslim alındığında her kalem için bir "return" stok hareketi yazar — denetim
 * izi için. Event: `order.return_received`. Best-effort.
 * NOT: Satıcı/hakem onay akışı (acceptSellerReturn) bu kaydı DOĞRUDAN da yazar; bu
 * subscriber yalnız event-tabanlı diğer yollar için yedek (idempotent değildir,
 * ama receiveAndComplete bu event'i emit etmediği için pratikte tek kayıt oluşur).
 */
export default async function returnStockHandler({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; return_id: string }>) {
  await recordReturnStockMovements(container, data.return_id)
}

export const config: SubscriberConfig = {
  event: "order.return_received",
}
