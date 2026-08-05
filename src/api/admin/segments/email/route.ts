import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { computeCustomerRFM, SEGMENT_LABELS } from "../../../../lib/segments"
import { sendMail } from "../../../../lib/mailer"
import { errorMessage } from "../../../../lib/errors"

const schema = z.object({
  segment: z.enum(["champions", "loyal", "new", "at_risk", "dormant", "lost"]),
  subject: z.string().trim().min(1).max(200),
  html: z.string().trim().min(1).max(50000),
  // Güvenlik: yanlışlıkla dev tüm listeye gönderimi önlemek için üst sınır.
  limit: z.coerce.number().int().min(1).max(2000).optional(),
})

/**
 * POST /admin/segments/email — bir RFM segmentindeki müşterilere e-posta kampanyası.
 * KVKK: yalnız e-posta iznini AÇIK bırakan (metadata.comm_email !== false) müşterilere
 * gönderilir. Segment üyeleri gerçek sipariş geçmişinden (computeCustomerRFM) hesaplanır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz kampanya verisi.", issues: parsed.error.issues })
  }
  const { segment, subject, html, limit } = parsed.data

  const rfm = await computeCustomerRFM(req.scope)
  const memberIds = rfm.filter((c) => c.segment === segment).map((c) => c.customer_id)

  if (memberIds.length === 0) {
    return res.json({ segment, matched: 0, sent: 0, skipped_consent: 0 })
  }

  // Müşteri e-posta + izin bilgisi.
  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerModule.listCustomers(
    { id: memberIds },
    { select: ["id", "email", "metadata"] }
  )

  const recipients: string[] = []
  let skippedConsent = 0
  for (const c of customers) {
    if (!c.email) continue
    if ((c.metadata as any)?.comm_email === false) {
      skippedConsent++
      continue
    }
    recipients.push(c.email)
  }

  const capped = typeof limit === "number" ? recipients.slice(0, limit) : recipients
  if (capped.length < recipients.length) {
    req.scope
      .resolve("logger")
      .info(`[segments/email] ${segment}: ${recipients.length} alıcıdan ilk ${capped.length} gönderildi (limit).`)
  }

  let sent = 0
  for (const to of capped) {
    try {
      const r = await sendMail({ to, subject, html })
      if (r.ok) sent++
    } catch (e) {
      req.scope.resolve("logger").warn(`[segments/email] ${to}: ${errorMessage(e)}`)
    }
  }

  return res.json({
    segment,
    segment_label: SEGMENT_LABELS[segment],
    matched: memberIds.length,
    sent,
    skipped_consent: skippedConsent,
  })
}
