import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { isLlmEnabled, analyzeMarketplaceInsights } from "../../../lib/llm"
import { computeSellerScorecard, computeSellerAnalytics } from "../../../lib/seller-scorecard"

const bodySchema = z.object({
  question: z.string().trim().min(3).max(400),
})

const tl = (minor: number) => Math.round((Number(minor) || 0) / 100)

/**
 * POST /admin/ai-insights  { question }
 * Doğal-dil pazaryeri analitiği: tüm satıcıların karne + son-30-gün özetinden bir
 * snapshot kurar ve LLM'e verir (RAG — DB sorgusu çalıştırmaz, yalnız verilen veriden
 * yanıtlar, sayı uydurmaz). Admin-only. AI kapalı/hata → { answer: "" } (fail-open).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçerli bir soru yazın (3-400 karakter).", issues: parsed.error.issues })
  }
  if (!isLlmEnabled()) {
    return res.json({ answer: "", disabled: true })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "is_house", "commission_rate"],
    pagination: { take: 50 },
  })

  const saticilar: Record<string, unknown>[] = []
  for (const s of (sellers as any[] | undefined ?? [])) {
    const [sc, an] = await Promise.all([
      computeSellerScorecard(req.scope, s.id),
      computeSellerAnalytics(req.scope, s.id, 30),
    ])
    saticilar.push({
      satici: s.name,
      ana_magaza: !!s.is_house,
      komisyon_yuzde: s.commission_rate ?? null,
      karne_notu: sc.has_data ? sc.grade : "veri yok",
      karne_skoru: sc.has_data ? sc.overall_score : null,
      son30g_siparis: an.totals.orders,
      son30g_ciro_TL: tl(an.totals.sales),
      son30g_net_TL: tl(an.totals.earning),
      musteri_puani: sc.rating.count > 0 ? sc.rating.avg : null,
      puan_sayisi: sc.rating.count,
      iade_orani_yuzde: Math.round(sc.returns.return_rate * 100),
      iadeli_siparis: sc.returns.returned_order_count,
      toplam_siparis: sc.returns.total_order_count,
      zamaninda_kargo_yuzde: Math.round(sc.shipping.on_time_rate * 100),
      iptal_orani_yuzde: Math.round(sc.cancellation.cancel_rate * 100),
      soru_yanitlama_yuzde: Math.round(sc.questions.answer_rate * 100),
    })
  }

  const platform = {
    satici_sayisi: saticilar.length,
    son30g_toplam_ciro_TL: saticilar.reduce((a, s) => a + (Number(s.son30g_ciro_TL) || 0), 0),
    son30g_toplam_siparis: saticilar.reduce((a, s) => a + (Number(s.son30g_siparis) || 0), 0),
  }

  const snapshot = { donem: "son 30 gün", platform, saticilar }

  const out = await analyzeMarketplaceInsights({ question: parsed.data.question, snapshot })
  if (!out.ok) return res.json({ answer: "", error: out.error })
  return res.json({ answer: out.answer })
}
