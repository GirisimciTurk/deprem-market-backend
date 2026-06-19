import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeCustomerRFM, summarizeSegments, type SegmentKey } from "../../../../lib/segments"

/**
 * GET /admin/analytics/segments
 * RFM müşteri segmentleri özeti + her segment için en değerli birkaç örnek müşteri
 * (hedefli kampanya için). Admin-only.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const rfm = await computeCustomerRFM(req.scope)
  const summary = summarizeSegments(rfm)

  // Her segmentten en yüksek harcamalı 3 müşteriyi örnekle (e-posta/isim çöz).
  const sampleByKey = new Map<SegmentKey, string[]>()
  for (const s of summary) {
    const ids = rfm
      .filter((c) => c.segment === s.key)
      .sort((a, b) => b.monetary - a.monetary)
      .slice(0, 3)
      .map((c) => c.customer_id)
    sampleByKey.set(s.key, ids)
  }
  const allSampleIds = [...new Set([...sampleByKey.values()].flat())]

  const nameMap = new Map<string, { email: string | null; name: string }>()
  if (allSampleIds.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { id: allSampleIds } as any,
    })
    for (const c of (customers as any[]) ?? []) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Müşteri"
      nameMap.set(c.id, { email: c.email ?? null, name })
    }
  }

  const rfmByCustomer = new Map(rfm.map((c) => [c.customer_id, c]))
  const segments = summary.map((s) => ({
    ...s,
    samples: (sampleByKey.get(s.key) ?? []).map((id) => ({
      customer_id: id,
      name: nameMap.get(id)?.name ?? "Müşteri",
      email: nameMap.get(id)?.email ?? null,
      orders: rfmByCustomer.get(id)?.orders ?? 0,
      monetary: rfmByCustomer.get(id)?.monetary ?? 0,
    })),
  }))

  return res.json({
    total_customers: rfm.length,
    segments,
  })
}
