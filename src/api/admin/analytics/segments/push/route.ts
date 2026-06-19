import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { computeCustomerRFM, SEGMENT_LABELS, type SegmentKey } from "../../../../../lib/segments"
import { broadcast } from "../../../../../lib/web-push"

/**
 * POST /admin/analytics/segments/push
 * Seçilen RFM segmentindeki müşterilere hedefli web push gönderir
 * (push aboneliği olanlara). Admin-only.
 */
const schema = z.object({
  segment: z.enum(["champions", "loyal", "new", "at_risk", "dormant", "lost"]),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(180),
  url: z.string().trim().max(300).optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz kampanya verisi.", issues: parsed.error.issues })
  }
  const { segment, title, body, url } = parsed.data

  const rfm = await computeCustomerRFM(req.scope)
  const customerIds = rfm.filter((c) => c.segment === (segment as SegmentKey)).map((c) => c.customer_id)

  if (!customerIds.length) {
    return res.json({ segment, segment_label: SEGMENT_LABELS[segment], audience: 0, total: 0, sent: 0, message: "Bu segmentte müşteri yok." })
  }

  // broadcast: yalnız bu müşterilerin push aboneliklerine gönderir (filtre).
  const result = await broadcast(
    req.scope,
    { title, body, url: url || "/tr", tag: `campaign-${segment}` },
    { customer_id: customerIds }
  )

  return res.json({
    segment,
    segment_label: SEGMENT_LABELS[segment],
    audience: customerIds.length, // segmentteki müşteri sayısı
    total: result.total, // eşleşen abonelik sayısı
    sent: result.sent, // başarıyla gönderilen
  })
}
