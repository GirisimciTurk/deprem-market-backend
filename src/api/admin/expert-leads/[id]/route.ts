import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { EXPERT_LEAD_MODULE } from "../../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../../modules/expert_lead/service"

const updateSchema = z.object({
  status: z.enum(["new", "contacted", "approved", "archived"]).optional(),
  notes: z.string().optional(),
})

/** POST /admin/expert-leads/:id  { status?, notes? } — durum / iç not güncelle. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Geçersiz veri." })
  if (parsed.data.status === undefined && parsed.data.notes === undefined) {
    return res.status(400).json({ message: "Güncellenecek alan yok." })
  }

  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  const lead = await service.updateExpertLeads({
    id: req.params.id,
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
  })

  return res.json({ lead })
}

/** DELETE /admin/expert-leads/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  await service.deleteExpertLeads(req.params.id)
  return res.json({ id: req.params.id, object: "expert_lead", deleted: true })
}
