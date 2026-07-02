import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { generateSellerResetLink } from "../../../../../lib/seller-invite"

/**
 * POST /vendors/team/:id/reset-password — bir çalışana şifre-sıfırlama bağlantısı
 * gönderir (e-posta + elle iletmek için link döner). Sahip/ekip-yöneticisi çağırır;
 * şifresini unutan çalışan böylece tekrar erişebilir.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const id = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "email", "seller_id", "is_owner"],
    filters: { id } as any,
  })
  const member = data?.[0] as any
  if (!member || member.seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Çalışan bulunamadı." })
  }
  // Mağaza sahibinin şifre-sıfırlama bağlantısını yalnız bir başka sahip üretebilir.
  // Aksi halde `team:full` yetkili bir çalışan, sahibin linkini alıp hesabını ele
  // geçirebilirdi (link yanıtta düz metin dönüyor).
  if (member.is_owner && !resolved.admin.is_owner) {
    return res.status(403).json({ message: "Mağaza sahibinin şifresini sıfırlayamazsınız." })
  }
  if (!member.email) {
    return res.status(400).json({ message: "Çalışanın e-posta adresi yok." })
  }

  const result = await generateSellerResetLink(req.scope, member.email)
  if (!result.ok) return res.status(400).json({ message: result.message })

  return res.json({ email: member.email, reset_link: result.reset_link })
}
