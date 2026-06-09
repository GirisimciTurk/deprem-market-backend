import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { RESELLER_MODULE } from "../../../../modules/reseller"
import ResellerModuleService from "../../../../modules/reseller/service"

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
})

/** POST /admin/reseller-applications/:id  { status } */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Geçersiz durum." })

  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  const application = await reseller.updateResellerApplications({
    id: req.params.id,
    status: parsed.data.status,
  })
  return res.json({ application })
}

/** DELETE /admin/reseller-applications/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  await reseller.deleteResellerApplications(req.params.id)
  return res.json({ id: req.params.id, object: "reseller_application", deleted: true })
}
