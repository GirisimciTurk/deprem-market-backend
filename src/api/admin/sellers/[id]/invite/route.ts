import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { inviteSeller } from "../../../../../lib/seller-invite"

/**
 * POST /admin/sellers/:id/invite
 * Satıcıya panel girişi hazırlar ve "şifreni belirle" BAĞLANTILI e-posta gönderir
 * (düz metin şifre yok). İlk davet veya tekrar gönderme için kullanılır. reset_link
 * yanıtta da döner (admin SMTP kapalıyken elle iletebilsin).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const result = await inviteSeller(req.scope, req.params.id)
  if (!result.ok) {
    const code = result.reason === "not_found" ? 404 : 400
    return res.status(code).json({ message: result.message })
  }
  return res.json({
    ok: true,
    email: result.email,
    created: result.created,
    reset_link: result.reset_link,
  })
}
