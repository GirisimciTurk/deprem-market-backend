import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { refundOrderAmount, RefundError } from "../../../lib/refund-order"

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
 * sonra (kalan) tutarı iade eder. Çekirdek mantık `lib/refund-order.ts`'te (satıcı
 * iade onayındaki otomatik iade de aynı lib'i kullanır). Burada strict=true →
 * tutar kalan bakiyeyi aşarsa hata.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz iade isteği." })
  }
  const { order_id, amount: requested } = parsed.data
  const logger = req.scope.resolve("logger")

  try {
    const result = await refundOrderAmount(req.scope, order_id, requested, { strict: true })
    if (!result.refunded) {
      const msg =
        result.skipped === "no_payment"
          ? "Bu siparişe ait ödeme bulunamadı."
          : "İade edilecek tutar yok."
      return res.status(400).json({ message: msg })
    }
    return res.json({ success: true, payment_id: result.payment_id, refunded: result.refunded })
  } catch (e: any) {
    if (e instanceof RefundError) {
      return res.status(400).json({ message: e.message })
    }
    logger.error(`Refund başarısız (${order_id}): ${e?.message}`)
    return res.status(400).json({ message: e?.message || "İade başarısız." })
  }
}
