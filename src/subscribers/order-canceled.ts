import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendOrderCanceledEmail } from "../lib/order-canceled-mail"
import { MARKETPLACE_MODULE } from "../modules/marketplace"

/**
 * Sipariş iptal edildiğinde müşteriye "Siparişiniz İptal Edildi" e-postası gönderir
 * (varsa iade tutarıyla).
 *
 * PARA İADESİ: Medusa'nın native cancel-order akışı capture'lanmış ödemeleri ZATEN
 * otomatik iade eder (refundCapturedPaymentsWorkflow — Paynkolay dahil provider'ın
 * refundPayment'ını çağırır) ve yetkilendirilmiş ama tahsil edilmemiş ödemeleri iptal/void
 * eder. Bu yüzden burada AYRICA iade YAPMAYIZ; yalnız toplam iade tutarını okuyup e-postada
 * bildiririz.
 *
 * Event: `order.canceled` (OrderWorkflowEvents.CANCELED). Payload: `{ id }`.
 */
export default async function orderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  let totalRefundedMinor = 0
  let currencyCode = "try"

  // Toplam iade tutarını oku. order.canceled EMIT anında order→payment_collections
  // linki / refund kayıtları henüz indekslenmemiş olabiliyor → kısa retry.
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: orders } = await query.graph({
        entity: "order",
        fields: [
          "currency_code",
          "payment_collections.payments.captured_at",
          "payment_collections.payments.refunds.amount",
        ],
        filters: { id: orderId },
      })
      const order = orders?.[0]
      currencyCode = order?.currency_code || currencyCode
      const payments = (order?.payment_collections || []).flatMap(
        (pc: any) => pc.payments || []
      )
      const hasCaptured = payments.some((p: any) => p.captured_at)
      totalRefundedMinor = payments.reduce(
        (sum: number, p: any) =>
          sum +
          (p.refunds || []).reduce(
            (s: number, r: any) => s + Number(r.amount || 0),
            0
          ),
        0
      )
      // Tahsilat varsa iade indekslenene kadar bekle; tahsilat yoksa beklemeye gerek yok.
      if (!hasCaptured || totalRefundedMinor > 0) break
      await new Promise((r) => setTimeout(r, 600))
    }
    if (totalRefundedMinor > 0) {
      logger.info(`[OrderCanceled] Native iade tespit edildi: ${totalRefundedMinor} (sipariş ${orderId})`)
    }
  } catch (e: any) {
    logger.error(`[OrderCanceled] İade tutarı okunamadı: ${e?.message}`)
  }

  await sendOrderCanceledEmail(container, orderId, totalRefundedMinor, currencyCode)

  // Sipariş iptal edildi → bu siparişin seller_order'larını "canceled" yap ve
  // kargo ücretini sıfırla (gönderim yok). Böylece iptal edilen sipariş satıcının
  // ödenecek bakiyesine/kazancına katkı vermez (net hesapları canceled'ı hariç tutar).
  try {
    const marketplace: any = container.resolve(MARKETPLACE_MODULE)
    const sellerOrders = await marketplace.listSellerOrders({ order_id: orderId }, { take: 100 })
    const toCancel = (sellerOrders as any[]).filter((so) => so.fulfillment_status !== "canceled")
    if (toCancel.length > 0) {
      await marketplace.updateSellerOrders(
        toCancel.map((so: any) => ({ id: so.id, fulfillment_status: "canceled", cargo_fee: 0 })) as any
      )
      logger.info(`[OrderCanceled] ${toCancel.length} seller_order iptal edildi (sipariş ${orderId}).`)
    }
  } catch (e: any) {
    logger.error(`[OrderCanceled] seller_order iptali başarısız: ${e?.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
