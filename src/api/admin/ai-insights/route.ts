import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { isLlmEnabled, analyzeMarketplaceInsights } from "../../../lib/llm"
import { computeSellerScorecard, computeSellerAnalytics } from "../../../lib/seller-scorecard"
import { computeCustomerRFM, summarizeSegments } from "../../../lib/segments"

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

  // Satıcılar paralel işlenir (her biri scorecard+analytics) — sıralı döngü yerine
  // Promise.all (seller-scorecards route'uyla aynı desen). 50 satıcıda belirgin hız.
  const saticilar: Record<string, unknown>[] = await Promise.all(
    (sellers as any[] | undefined ?? []).map(async (s) => {
      const [sc, an] = await Promise.all([
        computeSellerScorecard(req.scope, s.id),
        computeSellerAnalytics(req.scope, s.id, 30),
      ])
      return {
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
      }
    })
  )

  const platform = {
    satici_sayisi: saticilar.length,
    son30g_toplam_ciro_TL: saticilar.reduce((a, s) => a + (Number(s.son30g_ciro_TL) || 0), 0),
    son30g_toplam_siparis: saticilar.reduce((a, s) => a + (Number(s.son30g_siparis) || 0), 0),
  }

  // Davranış + segment snapshot — LLM funnel/arama/segment sorularını da yanıtlasın
  // ve aksiyon önerebilsin (yalnız verilen veriden; sayı uydurmaz).
  const knex: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const since = new Date(Date.now() - 30 * 86400000)
  const [bt] = await knex
    .raw(
      `select count(*) filter (where type='product_view')  as views,
              count(*) filter (where type='add_to_cart')    as carts,
              count(*) filter (where type='checkout_start') as checkouts,
              count(*) filter (where type='purchase')       as purchases
       from analytics_event where deleted_at is null and created_at >= ?`,
      [since]
    )
    .then((r: any) => r.rows)
  const noResult: any[] = await knex
    .raw(
      `select lower(search_query) as q, count(*) as c
       from analytics_event
       where deleted_at is null and created_at >= ? and type='search'
         and results_count = 0 and coalesce(trim(search_query),'') <> ''
       group by 1 order by c desc limit 5`,
      [since]
    )
    .then((r: any) => r.rows)
  const segOzet = summarizeSegments(await computeCustomerRFM(req.scope)).map((s) => ({
    segment: s.label,
    musteri_sayisi: s.count,
    toplam_harcama_TL: tl(s.total_monetary),
  }))
  const davranis = {
    son30g_funnel: {
      goruntuleme: Number(bt?.views || 0),
      sepete_ekleme: Number(bt?.carts || 0),
      odemeye_gecis: Number(bt?.checkouts || 0),
      satin_alma: Number(bt?.purchases || 0),
    },
    sonucsuz_aramalar: noResult.map((r) => ({ arama: r.q, sayi: Number(r.c) })),
    musteri_segmentleri: segOzet,
  }

  const snapshot = { donem: "son 30 gün", platform, saticilar, davranis }

  const out = await analyzeMarketplaceInsights({ question: parsed.data.question, snapshot })
  if (!out.ok) return res.json({ answer: "", error: out.error })
  return res.json({ answer: out.answer })
}
