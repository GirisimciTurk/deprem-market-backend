import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { computeSellerScorecard } from "../../../lib/seller-scorecard"

/**
 * GET /admin/seller-scorecards?status=active
 * Tüm satıcıların performans karnesi özeti — kontrol merkezi karşılaştırma tablosu.
 * Genel skora göre azalan sıralı.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const status = req.query.status as string | undefined
  const filters: Record<string, unknown> = {}
  if (status && ["pending", "active", "suspended"].includes(status)) filters.status = status

  // Kontrol merkezi karşılaştırması — satıcı sayısı makul; ilk 200 ile sınırla.
  const sellers = await marketplace.listSellers(filters, {
    order: { created_at: "DESC" },
    take: 200,
  })

  const rows = await Promise.all(
    sellers.map(async (s: any) => {
      const sc = await computeSellerScorecard(req.scope, s.id)
      return {
        seller_id: s.id,
        name: s.name,
        handle: s.handle,
        status: s.status,
        is_house: s.is_house,
        overall_score: sc.overall_score,
        grade: sc.grade,
        has_data: sc.has_data,
        on_time_rate: sc.shipping.on_time_rate,
        rating_avg: sc.rating.avg,
        rating_count: sc.rating.count,
        return_rate: sc.returns.return_rate,
        answer_rate: sc.questions.answer_rate,
        total_orders: sc.returns.total_order_count,
      }
    })
  )

  // Veri olanlar önce, sonra skora göre azalan.
  rows.sort((a, b) => {
    if (a.has_data !== b.has_data) return a.has_data ? -1 : 1
    return b.overall_score - a.overall_score
  })

  return res.json({ scorecards: rows, count: rows.length })
}
