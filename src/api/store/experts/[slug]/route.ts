import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { EXPERT_LEAD_MODULE } from "../../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../../modules/expert_lead/service"
import { toPublic } from "../route"

/** GET /store/experts/:slug — tek yayınlanmış profil (herkese açık). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const slug = req.params.slug
  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)

  const [lead] = await service.listExpertLeads(
    { slug, status: "approved", is_published: true },
    { take: 1 }
  )
  if (!lead) {
    return res.status(404).json({ message: "Profil bulunamadı." })
  }

  return res.json({ expert: toPublic(lead) })
}
