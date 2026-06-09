import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  refundPaymentWorkflow,
} from "@medusajs/medusa/core-flows"
import { z } from "zod"

const schema = z.object({
  order_id: z.string().min(1),
  // İade tutarı (minor unit / kuruş). Verilmezse kalan tutarın tamamı.
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
})

/**
 * POST /admin/order-refunds  { order_id, amount?, reason? }
 *
 * Tek-tık para iadesi: siparişin ödemesini bulur, gerekiyorsa önce capture eder,
 * sonra (kalan) tutarı iade eder. (/admin/orders/:id/* yolu Medusa core'a ait
 * olduğu için custom route burada ayrı path'te.)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz iade isteği." })
  }
  const { order_id, amount: requested } = parsed.data

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve("logger")

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
    filters: { id: order_id },
  })
  const order = orders?.[0]
  if (!order) return res.status(404).json({ message: "Sipariş bulunamadı." })

  const payments = (order.payment_collections || []).flatMap(
    (pc: any) => pc.payments || []
  )
  const payment = payments.find((p: any) => !p.canceled_at)
  if (!payment) {
    return res.status(400).json({ message: "Bu siparişe ait ödeme bulunamadı." })
  }

  if (!payment.captured_at) {
    try {
      await capturePaymentWorkflow(req.scope).run({
        input: { payment_id: payment.id },
      })
    } catch (e: any) {
      logger.error(`Refund: capture başarısız ${payment.id}: ${e?.message}`)
      return res
        .status(400)
        .json({ message: "Ödeme tahsil edilemedi (capture). İade yapılamadı." })
    }
  }

  const captured = Number(payment.amount || 0)
  const alreadyRefunded = (payment.refunds || []).reduce(
    (s: number, r: any) => s + Number(r.amount || 0),
    0
  )
  const refundable = captured - alreadyRefunded
  const amount = requested ?? refundable

  if (amount <= 0 || amount > refundable) {
    return res
      .status(400)
      .json({ message: `Geçersiz iade tutarı. İade edilebilir kalan: ${refundable}` })
  }

  try {
    await refundPaymentWorkflow(req.scope).run({
      input: { payment_id: payment.id, amount } as any,
    })
  } catch (e: any) {
    logger.error(`Refund başarısız ${payment.id}: ${e?.message}`)
    return res.status(400).json({ message: e?.message || "İade başarısız." })
  }

  return res.json({ success: true, payment_id: payment.id, refunded: amount })
}
