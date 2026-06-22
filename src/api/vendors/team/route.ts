import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveSeller } from "../_lib/resolve-seller"
import { inviteSellerStaff } from "../../../lib/seller-invite"
import { PERMISSION_KEYS } from "../../../lib/seller-permissions"

/** GET /vendors/team — mağazanın tüm kullanıcıları (sahip + çalışanlar). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "seller_admin",
    fields: [
      "id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "is_owner",
      "role",
      "permissions",
      "status",
      "created_at",
    ],
    filters: { seller_id: resolved.seller.id } as any,
  })

  const members = (data || []).sort((a: any, b: any) => {
    // Sahip(ler) üstte, sonra ada göre.
    if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1
    return String(a.created_at).localeCompare(String(b.created_at))
  })

  return res.json({ members, current_admin_id: resolved.admin.id })
}

const permLevel = z.enum(["none", "view", "full"])
const inviteSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin."),
  first_name: z.string().trim().min(1).optional().nullable(),
  last_name: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  role: z.string().optional().nullable(),
  permissions: z.record(z.string(), permLevel).optional().nullable(),
})

/** POST /vendors/team — yeni çalışan davet et (şifre-belirleme linki gönderilir). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = inviteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  // Bilinmeyen izin anahtarlarını ele.
  const perms = parsed.data.permissions
    ? Object.fromEntries(
        Object.entries(parsed.data.permissions).filter(([k]) => PERMISSION_KEYS.includes(k))
      )
    : {}

  const result = await inviteSellerStaff(req.scope, resolved.seller.id, {
    email: parsed.data.email,
    first_name: parsed.data.first_name ?? null,
    last_name: parsed.data.last_name ?? null,
    phone: parsed.data.phone ?? null,
    role: parsed.data.role ?? "custom",
    permissions: perms as any,
  })

  if (!result.ok) {
    const status = result.reason === "email_taken" || result.reason === "linked_elsewhere" ? 409 : 400
    return res.status(status).json({ message: result.message, reason: result.reason })
  }

  return res.json({
    seller_admin_id: result.seller_admin_id,
    email: result.email,
    created: result.created,
    // SMTP kapalıyken sahip linki elle iletebilsin diye döndürülür.
    reset_link: result.reset_link,
  })
}
