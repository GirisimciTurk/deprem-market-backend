import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { sendToCustomer } from "./web-push"

/**
 * Sipariş durumuna göre giriş yapmış müşteriye web push gönderir.
 *
 * Misafir siparişlerinde (customer_id yok) push atlanır — onlar e-posta alır.
 * Bildirime tıklayınca storefront'taki sipariş detayı açılır.
 */
export type OrderPushStatus = "placed" | "shipped" | "delivered" | "canceled"

const COPY: Record<
  OrderPushStatus,
  (no: string) => { title: string; body: string }
> = {
  placed: (no) => ({
    title: "Siparişiniz alındı ✅",
    body: `#${no} numaralı siparişiniz başarıyla oluşturuldu.`,
  }),
  shipped: (no) => ({
    title: "Siparişiniz kargoda 🚚",
    body: `#${no} numaralı siparişiniz kargoya verildi.`,
  }),
  delivered: (no) => ({
    title: "Siparişiniz teslim edildi 📦",
    body: `#${no} numaralı siparişiniz teslim edildi. Afiyet olsun!`,
  }),
  canceled: (no) => ({
    title: "Siparişiniz iptal edildi",
    body: `#${no} numaralı siparişiniz iptal edildi.`,
  }),
}

export async function sendOrderPush(
  container: MedusaContainer,
  orderId: string,
  status: OrderPushStatus
): Promise<void> {
  const logger = container.resolve("logger")
  const orderModule = container.resolve(Modules.ORDER)

  let order: any
  try {
    order = await orderModule.retrieveOrder(orderId)
  } catch (err: any) {
    logger.warn(`[OrderPush] Sipariş bulunamadı: ${orderId} (${err?.message})`)
    return
  }

  const customerId = order?.customer_id
  if (!customerId) {
    return // misafir sipariş → push yok
  }

  const no = order.display_id?.toString() || orderId.substring(0, 8)
  const copy = COPY[status](no)

  try {
    const sent = await sendToCustomer(container, customerId, {
      ...copy,
      url: `/tr/account/orders/details/${orderId}`,
      tag: `order-${orderId}`,
    })
    if (sent > 0) {
      logger.info(`[OrderPush:${status}] ${sent} cihaza gönderildi (#${no}).`)
    }
  } catch (err: any) {
    logger.warn(`[OrderPush:${status}] Gönderim hatası: ${err?.message}`)
  }
}
