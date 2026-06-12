import { MedusaContainer } from "@medusajs/framework/types"
import { settlePendingPayouts } from "../lib/settlement"

/**
 * Günlük hakediş işi: kargolanmış ve bekleme süresini doldurmuş alt-siparişleri
 * "eligible" (ödenebilir) yapar. Her gün 02:00'de çalışır.
 */
export default async function settlePayoutsJob(container: MedusaContainer) {
  const logger = container.resolve("logger")
  const count = await settlePendingPayouts(container)
  if (count > 0) logger.info(`[settle-payouts] ${count} alt-sipariş hakediş etti (eligible).`)
}

export const config = {
  name: "settle-payouts-daily",
  schedule: "0 2 * * *",
}
