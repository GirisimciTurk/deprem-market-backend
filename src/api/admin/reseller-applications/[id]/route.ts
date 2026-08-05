import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { RESELLER_MODULE } from "../../../../modules/reseller"
import ResellerModuleService from "../../../../modules/reseller/service"
import {
  sendResellerStatusEmail,
  ResellerMailStatus,
} from "../../../../lib/reseller-mail"
import { provisionSellerFromApplication } from "../../../../lib/provision-seller-from-application"
import { errorMessage } from "../../../../lib/errors"

const updateSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
})

const MAIL_STATUSES: ResellerMailStatus[] = ["approved", "rejected", "suspended"]

/** POST /admin/reseller-applications/:id  { status } — durum güncellenir;
 *  onay/red/askıya alma sonucunda başvuru sahibine bilgilendirme maili gider. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Geçersiz durum." })

  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  // "rejected" yapıldığında zaman damgası vurulur → saatlik temizlik işi 24 saat
  // sonra siler. Başka bir duruma alınırsa damga sıfırlanır (silme iptal).
  let application = await reseller.updateResellerApplications({
    id: req.params.id,
    status: parsed.data.status,
    rejected_at: parsed.data.status === "rejected" ? new Date() : null,
  })

  // Onaylandıysa satıcı hesabını OTOMATİK aç (idempotent; seller_id doluysa atlar).
  // Böylece manuel "başvuruyu satıcıya çevirme" adımı ortadan kalkar.
  if (parsed.data.status === "approved") {
    try {
      await provisionSellerFromApplication(req.scope, application)
      // seller_id yazıldıysa güncel kaydı geri oku (yanıtta dönsün).
      application = await reseller.retrieveResellerApplication(req.params.id)
    } catch (e) {
      req.scope.resolve("logger").error(`[reseller-applications] Satıcı açılamadı: ${errorMessage(e)}`)
    }
  }

  // Sonuç maili (mail hatası admin akışını bozmasın).
  if (MAIL_STATUSES.includes(parsed.data.status as ResellerMailStatus)) {
    try {
      await sendResellerStatusEmail(
        req.scope,
        application as any,
        parsed.data.status as ResellerMailStatus
      )
    } catch (e) {
      req.scope.resolve("logger").error(`[reseller-applications] Mail gönderilemedi: ${errorMessage(e)}`)
    }
  }

  return res.json({ application })
}

/** DELETE /admin/reseller-applications/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  await reseller.deleteResellerApplications(req.params.id)
  return res.json({ id: req.params.id, object: "reseller_application", deleted: true })
}
