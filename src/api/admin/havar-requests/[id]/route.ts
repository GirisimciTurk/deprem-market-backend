import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { HAVAR_MODULE } from "../../../../modules/havar"
import HavarModuleService from "../../../../modules/havar/service"
import { sendHavarApprovedEmail } from "../../../../lib/havar-mail"

const updateSchema = z.object({
  status: z.enum(["pending", "reviewed", "contacted", "closed"]),
})

/**
 * POST /admin/havar-requests/:id  { status } — talep durumunu günceller.
 * status="reviewed" (ONAYLA) olduğunda talep sahibine "en yakın zamanda iletişime
 * geçilecek" e-postası gönderilir.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Geçersiz durum." })

  const havar: HavarModuleService = req.scope.resolve(HAVAR_MODULE)
  const request = await havar.updateHavarRequests({
    id: req.params.id,
    status: parsed.data.status,
  })

  if (parsed.data.status === "reviewed") {
    try {
      await sendHavarApprovedEmail(req.scope, request as any)
    } catch (e: any) {
      req.scope.resolve("logger").error(`[havar-requests] Onay maili gönderilemedi: ${e?.message}`)
    }
  }

  return res.json({ request: { id: (request as any).id, status: (request as any).status } })
}
