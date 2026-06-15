import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

const schema = z.object({
  old_password: z.string().min(1, "Mevcut şifre gerekli"),
  new_password: z.string().min(8, "Yeni şifre en az 8 karakter olmalı"),
})

/**
 * POST /store/customers/me/change-password { old_password, new_password }
 * Giriş yapmış müşteri şifresini değiştirir. Eski şifre auth modülüyle DOĞRULANIR;
 * doğruysa emailpass provider identity'si yeni şifreyle güncellenir (token gerektirmez,
 * server-side güvenli yol). Oturum geçerli kalır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as any).auth_context
  if (!authContext?.actor_id) {
    return res.status(401).json({ message: "Bu işlem için giriş yapmalısınız." })
  }

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || "Geçersiz veri." })
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const authModule = req.scope.resolve(Modules.AUTH)

  const customer = await customerModule
    .retrieveCustomer(authContext.actor_id)
    .catch(() => null)
  const email = customer?.email
  if (!email) {
    return res.status(400).json({ message: "Hesap e-postası bulunamadı." })
  }

  // 1) Eski şifreyi doğrula
  const authResult = await authModule
    .authenticate("emailpass", {
      body: { email, password: parsed.data.old_password },
    } as any)
    .catch(() => ({ success: false }) as any)
  if (!authResult?.success) {
    return res.status(401).json({ message: "Mevcut şifreniz hatalı." })
  }

  // 2) Yeni şifreyi belirle (emailpass update — token gerekmez)
  try {
    await authModule.updateProvider("emailpass", {
      entity_id: email,
      password: parsed.data.new_password,
    })
  } catch (e: any) {
    req.scope.resolve("logger").error(`[change-password] ${e?.message}`)
    return res.status(500).json({ message: "Şifre güncellenemedi." })
  }

  return res.json({ success: true })
}
