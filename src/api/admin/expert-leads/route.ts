import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { EXPERT_LEAD_MODULE } from "../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../modules/expert_lead/service"

const STATUSES = ["new", "contacted", "approved", "archived"]

/** GET /admin/expert-leads?status=&specialization=&q=&limit=&offset= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const providerType = req.query.provider_type as string | undefined
  const specialization = (req.query.specialization as string | undefined)?.trim()
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  // Filtreler DB seviyesinde — arama da DB'de (ILIKE) yapılır ki sayfa sınırının
  // ötesindeki kayıtlar da bulunabilsin.
  const filters: Record<string, unknown> = {}
  if (status && STATUSES.includes(status)) filters.status = status
  if (providerType && ["engineer", "implementer"].includes(providerType)) {
    filters.provider_type = providerType
  }
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { full_name: { $ilike: like } },
      { email: { $ilike: like } },
      { city: { $ilike: like } },
      { district: { $ilike: like } },
    ]
  }

  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  const [leads, count] = await service.listAndCountExpertLeads(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Uzmanlık filtresi JSON dizisi üzerinde — bellekte uygulanır (kayıt sayısı küçük,
  // discovery aşaması). Sayfa sayımı için filtrelenmiş listenin boyutu yansıtılır.
  let items = leads as any[]
  if (specialization) {
    items = items.filter((l) => Array.isArray(l.specializations) && l.specializations.includes(specialization))
  }

  return res.json({
    leads: items,
    count: specialization ? items.length : count,
    offset,
    limit,
  })
}
