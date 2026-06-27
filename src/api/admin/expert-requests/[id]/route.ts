import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { EXPERT_LEAD_MODULE } from "../../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../../modules/expert_lead/service"

const updateSchema = z.object({
  status: z.enum(["new", "forwarded", "closed"]),
})

/** POST /admin/expert-requests/:id { status } — talep durumunu güncelle. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Geçersiz veri." })

  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  const request = await service.updateExpertRequests({
    id: req.params.id,
    status: parsed.data.status,
  })
  return res.json({ request })
}

/** DELETE /admin/expert-requests/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  await service.deleteExpertRequests(req.params.id)
  return res.json({ id: req.params.id, object: "expert_request", deleted: true })
}
