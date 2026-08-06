import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { sendToCustomerLocalized } from "./web-push"
import { errorMessage } from "./errors"
import { orderPushPayload, type OrderPushStatus } from "./push-i18n"

// Tip push-i18n'e taşındı (metin katalogu orada); çağıranlar bu modülden
// import etmeye devam edebilsin diye yeniden dışa veriliyor.
export type { OrderPushStatus }

/**
 * Sipariş durumuna göre giriş yapmış müşteriye web push gönderir.
 *
 * Misafir siparişlerinde (customer_id yok) push atlanır — onlar e-posta alır.
 * Bildirime tıklayınca storefront'taki sipariş detayı açılır.
 *
 * Metin, HER CİHAZIN kendi diline göre kurulur (push-i18n): tek bir müşterinin
 * cihazları farklı dillerde olabilir. Eskiden herkese sabit Türkçe gidiyordu.
 */
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
  } catch (err) {
    logger.warn(`[OrderPush] Sipariş bulunamadı: ${orderId} (${errorMessage(err)})`)
    return
  }

  const customerId = order?.customer_id
  if (!customerId) {
    return // misafir sipariş → push yok
  }

  const no = order.display_id?.toString() || orderId.substring(0, 8)

  try {
    const sent = await sendToCustomerLocalized(container, customerId, (locale) =>
      orderPushPayload(locale, { status, orderNo: no, orderId })
    )
    if (sent > 0) {
      logger.info(`[OrderPush:${status}] ${sent} cihaza gönderildi (#${no}).`)
    }
  } catch (err) {
    logger.warn(`[OrderPush:${status}] Gönderim hatası: ${errorMessage(err)}`)
  }
}
