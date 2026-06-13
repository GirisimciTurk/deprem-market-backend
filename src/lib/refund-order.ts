import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  refundPaymentWorkflow,
} from "@medusajs/medusa/core-flows"

export type RefundResult = {
  refunded: number
  payment_id?: string
  /** "no_payment" | "nothing_refundable" | "zero" — iade yapılmadıysa neden. */
  skipped?: string
}

export class RefundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RefundError"
  }
}

/**
 * Siparişin ödemesini bulur, gerekiyorsa önce capture eder, sonra `requested`
 * (verilmezse kalan) tutarı müşteriye iade eder. İade-EDİLEBİLİR bakiye guard'ı
 * çift-iadeyi önler.
 *
 * - `strict=false` (varsayılan): `requested` kalan bakiyeyi aşarsa kalana kıstırır
 *   → otomatik iade (satıcı onayı) için güvenli.
 * - `strict=true`: `requested` > kalan ise `RefundError` fırlatır → admin tek-tık iade.
 *
 * Ödeme yoksa veya iade edilecek bakiye kalmadıysa HATA fırlatmaz; `{refunded:0, skipped}`
 * döner (satıcı onay akışı, ödenmemiş/önceden iade edilmiş siparişte de devam etmeli).
 */
export async function refundOrderAmount(
  container: any,
  orderId: string,
  requested?: number,
  opts: { strict?: boolean } = {}
): Promise<RefundResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve("logger")

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.payments.id",
      "payment_collections.payments.amount",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "payment_collections.payments.refunds.amount",
    ],
    filters: { id: orderId },
  })
  const order = orders?.[0]
  if (!order) throw new RefundError("Sipariş bulunamadı.")

  const payments = (order.payment_collections || []).flatMap(
    (pc: any) => pc.payments || []
  )
  const payment = payments.find((p: any) => !p.canceled_at)
  if (!payment) return { refunded: 0, skipped: "no_payment" }

  if (!payment.captured_at) {
    try {
      await capturePaymentWorkflow(container).run({
        input: { payment_id: payment.id },
      })
    } catch (e: any) {
      logger.error(`Refund: capture başarısız ${payment.id}: ${e?.message}`)
      throw new RefundError("Ödeme tahsil edilemedi (capture). İade yapılamadı.")
    }
  }

  const captured = Number(payment.amount || 0)
  const alreadyRefunded = (payment.refunds || []).reduce(
    (s: number, r: any) => s + Number(r.amount || 0),
    0
  )
  const refundable = captured - alreadyRefunded
  if (refundable <= 0) {
    return { refunded: 0, payment_id: payment.id, skipped: "nothing_refundable" }
  }

  let amount = requested ?? refundable
  if (amount > refundable) {
    if (opts.strict) {
      throw new RefundError(`Geçersiz iade tutarı. İade edilebilir kalan: ${refundable}`)
    }
    amount = refundable // auto-refund: kalana kıstır
  }
  if (amount <= 0) {
    if (opts.strict) {
      throw new RefundError(`Geçersiz iade tutarı. İade edilebilir kalan: ${refundable}`)
    }
    return { refunded: 0, payment_id: payment.id, skipped: "zero" }
  }

  await refundPaymentWorkflow(container).run({
    input: { payment_id: payment.id, amount } as any,
  })
  return { refunded: amount, payment_id: payment.id }
}
