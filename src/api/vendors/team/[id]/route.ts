import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../modules/marketplace/service"
import { resolveSeller } from "../../_lib/resolve-seller"
import { PERMISSION_KEYS } from "../../../../lib/seller-permissions"

/** Hedef çalışanın bu mağazaya ait olduğunu doğrular. */
async function loadMember(req: MedusaRequest, sellerId: string, id: string) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "is_owner", "role", "permissions", "status", "seller_id", "email"],
    filters: { id } as any,
  })
  const m = data?.[0] as any
  if (!m || m.seller_id !== sellerId) return null
  return m
}

const permLevel = z.enum(["none", "view", "full"])
const updateSchema = z.object({
  first_name: z.string().trim().optional().nullable(),
  last_name: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  role: z.string().optional().nullable(),
  permissions: z.record(z.string(), permLevel).optional().nullable(),
  status: z.enum(["active", "disabled"]).optional(),
})

/** POST /vendors/team/:id — çalışanın rol/izin/durumunu günceller. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const id = req.params.id
  const member = await loadMember(req, resolved.seller.id, id)
  if (!member) return res.status(404).json({ message: "Çalışan bulunamadı." })

  // Sahibin izinleri değiştirilemez; sadece sahip başka bir sahibi düzenleyebilir.
  if (member.is_owner && !resolved.admin.is_owner) {
    return res.status(403).json({ message: "Mağaza sahibinin yetkilerini değiştiremezsiniz." })
  }

  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  const patch: Record<string, any> = { id }
  if (parsed.data.first_name !== undefined) patch.first_name = parsed.data.first_name
  if (parsed.data.last_name !== undefined) patch.last_name = parsed.data.last_name
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone
  if (parsed.data.role !== undefined) patch.role = parsed.data.role
  if (parsed.data.permissions !== undefined && parsed.data.permissions !== null) {
    patch.permissions = Object.fromEntries(
      Object.entries(parsed.data.permissions).filter(([k]) => PERMISSION_KEYS.includes(k))
    )
  }
  if (parsed.data.status !== undefined) {
    // Sahip askıya alınamaz; kendini askıya alamazsın.
    if (member.is_owner && parsed.data.status === "disabled") {
      return res.status(400).json({ message: "Mağaza sahibi askıya alınamaz." })
    }
    if (id === resolved.admin.id && parsed.data.status === "disabled") {
      return res.status(400).json({ message: "Kendinizi askıya alamazsınız." })
    }
    patch.status = parsed.data.status
  }
  // Sahiplerin izinleri her zaman tam → permissions yazımını yok say.
  if (member.is_owner) delete patch.permissions

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const updated = await marketplace.updateSellerAdmins(patch as any)
  return res.json({ member: updated })
}

/** DELETE /vendors/team/:id — çalışanı mağazadan kaldırır. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const id = req.params.id
  const member = await loadMember(req, resolved.seller.id, id)
  if (!member) return res.status(404).json({ message: "Çalışan bulunamadı." })

  if (member.is_owner) {
    return res.status(400).json({ message: "Mağaza sahibi kaldırılamaz." })
  }
  if (id === resolved.admin.id) {
    return res.status(400).json({ message: "Kendinizi kaldıramazsınız." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  // seller_admin'i sil + auth bağını kopar (app_metadata.seller_id temizle) → bu
  // kişi artık satıcı paneline giremez (müşteri kimliği varsa korunur).
  try {
    const authService: any = req.scope.resolve("auth")
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const email = (member.email || "").trim().toLowerCase()
    if (email) {
      const { data: pids } = await query.graph({
        entity: "provider_identity",
        fields: ["id", "auth_identity.id", "auth_identity.app_metadata"],
        filters: { provider: "emailpass", entity_id: email } as any,
      })
      const ai = (pids?.[0] as any)?.auth_identity
      if (ai?.id && ai?.app_metadata?.seller_id === id) {
        const meta = { ...ai.app_metadata }
        delete meta.seller_id
        await authService.updateAuthIdentities({ id: ai.id, app_metadata: meta })
      }
    }
  } catch (e: any) {
    try { req.scope.resolve("logger").warn(`[team:DELETE] auth bağı koparılamadı: ${e?.message}`) } catch {}
  }

  await marketplace.deleteSellerAdmins(id)
  return res.json({ id, deleted: true })
}
