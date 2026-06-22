import crypto from "crypto"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { generateResetPasswordTokenWorkflow } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import type MarketplaceModuleService from "../modules/marketplace/service"

/** Satıcı panel URL'i (env override; yereldeki vendor :5174, prod satici.depremtek.market). */
export function vendorPanelUrl(): string {
  return (
    process.env.VENDOR_PANEL_URL ||
    (process.env.VENDOR_DOMAIN ? `https://${process.env.VENDOR_DOMAIN}` : "http://localhost:5174")
  )
}

/** Kimseye gösterilmeyen, kimliği oluşturmak için tek seferlik rastgele şifre. */
function throwawayPassword(): string {
  return crypto.randomBytes(24).toString("base64url")
}

export type InviteResult =
  | { ok: true; email: string; created: boolean; reset_link: string }
  | { ok: false; reason: "not_found" | "house" | "no_email" | "auth_failed"; message: string }

/**
 * Bir satıcıya panel girişi hazırlar ve "şifreni belirle" BAĞLANTISI gönderir
 * (düz metin şifre YOK — güvenli, sektör standardı).
 *
 * Adımlar:
 *  1) emailpass kimliği yoksa rastgele (gösterilmeyen) şifreyle oluşturulur — böylece
 *     reset-token akışı bir kimlik bulabilir. Varsa (ör. aynı kişi müşteri) yeniden kullanılır,
 *     ŞİFRE DEĞİŞTİRİLMEZ.
 *  2) Auth identity actor_type "seller"e bağlanır (mevcut app_metadata korunur).
 *  3) SellerAdmin yoksa oluşturulur.
 *  4) generateResetPasswordTokenWorkflow ile token üretilir → `auth.password_reset` olayı →
 *     auth-password-reset subscriber satıcıya şifre-belirleme linkli e-posta atar.
 *
 * ASLA throw etmez. reset_link, admin'in (SMTP kapalıyken) elle iletebilmesi için döner.
 */
export async function inviteSeller(container: any, sellerId: string): Promise<InviteResult> {
  const logger = container.resolve("logger")
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const authService: any = container.resolve(Modules.AUTH)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const seller = await marketplace.retrieveSeller(sellerId).catch(() => null)
  if (!seller) return { ok: false, reason: "not_found", message: "Satıcı bulunamadı." }
  // NOT: House (ana mağaza) da artık satıcı panelinden yönetilir (saf pazaryeri modeli) →
  // ona da giriş kimliği açılabilir. Eskiden burada is_house engeli vardı, kaldırıldı.
  const email = ((seller as any).email || "").trim().toLowerCase()
  if (!email) return { ok: false, reason: "no_email", message: "Satıcının e-posta adresi yok." }

  // 1) Var olan emailpass kimliğini bul (provider_identity → auth_identity).
  let authIdentityId: string | undefined
  let existingMeta: Record<string, unknown> = {}
  try {
    const { data: pids } = await query.graph({
      entity: "provider_identity",
      fields: ["id", "entity_id", "provider", "auth_identity.id", "auth_identity.app_metadata"],
      filters: { provider: "emailpass", entity_id: email },
    })
    const ai = (pids?.[0] as any)?.auth_identity
    if (ai?.id) {
      authIdentityId = ai.id
      existingMeta = ai.app_metadata || {}
    }
  } catch {
    // yoksay; aşağıda register denenecek
  }

  // Kimlik yoksa rastgele şifreyle oluştur (şifre gösterilmez; satıcı linkle belirleyecek).
  if (!authIdentityId) {
    try {
      const reg = await authService.register("emailpass", { body: { email, password: throwawayPassword() } })
      if (reg?.success && reg.authIdentity?.id) {
        authIdentityId = reg.authIdentity.id
        existingMeta = reg.authIdentity.app_metadata || {}
      }
    } catch (e: any) {
      logger.error(`[SellerInvite] Auth kimliği oluşturulamadı (${email}): ${e?.message}`)
    }
  }
  if (!authIdentityId) {
    return { ok: false, reason: "auth_failed", message: "Giriş kimliği oluşturulamadı." }
  }

  // 2) SellerAdmin (yoksa) oluştur.
  const admins = await marketplace.listSellerAdmins({ seller_id: sellerId })
  let created = false
  let sellerAdminId = (admins[0] as any)?.id
  if (!sellerAdminId) {
    const a = await marketplace.createSellerAdmins({
      email,
      first_name: (seller as any).name || null,
      // Admin tarafından davet edilen ilk satıcı kullanıcısı = mağaza sahibi.
      is_owner: true,
      seller_id: sellerId,
    } as any)
    sellerAdminId = (a as any).id
    created = true
  }

  // 3) Auth identity'yi satıcı kullanıcısına bağla (müşteri kimliği vb. korunur).
  try {
    await authService.updateAuthIdentities({
      id: authIdentityId,
      app_metadata: { ...existingMeta, seller_id: sellerAdminId },
    })
  } catch (e: any) {
    logger.error(`[SellerInvite] Auth identity bağlanamadı: ${e?.message}`)
    return { ok: false, reason: "auth_failed", message: "Giriş kimliği satıcıya bağlanamadı." }
  }

  // 4) Şifre-belirleme token'ı üret → subscriber linkli e-posta atar.
  let token = ""
  try {
    const { result } = await generateResetPasswordTokenWorkflow(container).run({
      input: {
        entityId: email,
        actorType: "seller",
        provider: "emailpass",
        secret: process.env.JWT_SECRET as string,
      },
    })
    token = typeof result === "string" ? result : ""
  } catch (e: any) {
    logger.error(`[SellerInvite] Reset token üretilemedi: ${e?.message}`)
    return { ok: false, reason: "auth_failed", message: "Şifre belirleme bağlantısı üretilemedi." }
  }

  const reset_link = `${vendorPanelUrl()}/sifre-belirle?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  logger.info(`[SellerInvite] ${email} için giriş ${created ? "oluşturuldu" : "hazır"}; şifre-belirleme linki gönderildi.`)
  return { ok: true, email, created, reset_link }
}

/**
 * Var olan bir satıcı kullanıcısı için ŞİFRE-SIFIRLAMA bağlantısı üretir (ör.
 * şifresini unutan çalışana sahip tarafından gönderilir). generateResetPasswordToken
 * akışı `auth.password_reset` olayını tetikler → subscriber e-postayı atar; link
 * ayrıca (SMTP kapalıyken elle iletmek için) döndürülür. ASLA throw etmez.
 */
export async function generateSellerResetLink(
  container: any,
  email: string
): Promise<{ ok: true; reset_link: string } | { ok: false; message: string }> {
  const logger = container.resolve("logger")
  const normalized = (email || "").trim().toLowerCase()
  if (!normalized) return { ok: false, message: "E-posta adresi yok." }
  try {
    const { result } = await generateResetPasswordTokenWorkflow(container).run({
      input: {
        entityId: normalized,
        actorType: "seller",
        provider: "emailpass",
        secret: process.env.JWT_SECRET as string,
      },
    })
    const token = typeof result === "string" ? result : ""
    if (!token) return { ok: false, message: "Şifre sıfırlama bağlantısı üretilemedi." }
    const reset_link = `${vendorPanelUrl()}/sifre-belirle?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalized)}`
    return { ok: true, reset_link }
  } catch (e: any) {
    logger.error(`[SellerReset] ${normalized} için token üretilemedi: ${e?.message}`)
    return { ok: false, message: "Şifre sıfırlama bağlantısı üretilemedi." }
  }
}

export type StaffInviteInput = {
  email: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  role?: string | null
  permissions?: Record<string, "none" | "view" | "full"> | null
}

export type StaffInviteResult =
  | { ok: true; seller_admin_id: string; email: string; created: boolean; reset_link: string }
  | {
      ok: false
      reason: "not_found" | "no_email" | "auth_failed" | "email_taken" | "linked_elsewhere"
      message: string
    }

/**
 * Bir mağazaya ÇALIŞAN (alt-hesap) davet eder: yeni seller_admin oluşturur,
 * rol/izinlerini yazar, auth kimliğini bu çalışana bağlar ve "şifreni belirle"
 * bağlantısı gönderir. Sahip (owner) tarafından çağrılır.
 *
 * inviteSeller'dan farkı: HER ZAMAN yeni bir seller_admin oluşturur (mağazanın
 * ilk/owner admini değil) ve is_owner=false + verilen izinlerle kaydeder.
 * ASLA throw etmez.
 */
export async function inviteSellerStaff(
  container: any,
  sellerId: string,
  input: StaffInviteInput
): Promise<StaffInviteResult> {
  const logger = container.resolve("logger")
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const authService: any = container.resolve(Modules.AUTH)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const seller = await marketplace.retrieveSeller(sellerId).catch(() => null)
  if (!seller) return { ok: false, reason: "not_found", message: "Satıcı bulunamadı." }

  const email = (input.email || "").trim().toLowerCase()
  if (!email) return { ok: false, reason: "no_email", message: "E-posta adresi gerekli." }

  // Bu e-posta zaten bir seller_admin'e ait mi? (email global unique)
  const existingAdmins = await marketplace.listSellerAdmins({ email } as any).catch(() => [])
  const existing = (existingAdmins as any[])[0]
  if (existing) {
    const sid = (existing as any).seller_id || (existing as any).seller?.id
    if (sid && sid !== sellerId) {
      return { ok: false, reason: "email_taken", message: "Bu e-posta başka bir mağazaya kayıtlı." }
    }
  }

  // 1) emailpass kimliğini bul/oluştur.
  let authIdentityId: string | undefined
  let existingMeta: Record<string, unknown> = {}
  try {
    const { data: pids } = await query.graph({
      entity: "provider_identity",
      fields: ["id", "entity_id", "provider", "auth_identity.id", "auth_identity.app_metadata"],
      filters: { provider: "emailpass", entity_id: email },
    })
    const ai = (pids?.[0] as any)?.auth_identity
    if (ai?.id) {
      authIdentityId = ai.id
      existingMeta = ai.app_metadata || {}
    }
  } catch {
    // yoksay
  }

  if (!authIdentityId) {
    try {
      const reg = await authService.register("emailpass", {
        body: { email, password: throwawayPassword() },
      })
      if (reg?.success && reg.authIdentity?.id) {
        authIdentityId = reg.authIdentity.id
        existingMeta = reg.authIdentity.app_metadata || {}
      }
    } catch (e: any) {
      logger.error(`[StaffInvite] Auth kimliği oluşturulamadı (${email}): ${e?.message}`)
    }
  }
  if (!authIdentityId) {
    return { ok: false, reason: "auth_failed", message: "Giriş kimliği oluşturulamadı." }
  }

  // Bu kimlik zaten BAŞKA bir satıcı kullanıcısına bağlıysa (ör. başka mağazanın
  // sahibi) üzerine yazıp onun girişini bozmayalım.
  const linkedTo = (existingMeta as any)?.seller_id
  if (linkedTo && (!existing || linkedTo !== (existing as any).id)) {
    return {
      ok: false,
      reason: "linked_elsewhere",
      message: "Bu e-posta başka bir satıcı girişine bağlı.",
    }
  }

  // 2) seller_admin'i oluştur ya da güncelle.
  let created = false
  let sellerAdminId = (existing as any)?.id
  const fields = {
    email,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    phone: input.phone ?? null,
    role: input.role ?? "custom",
    permissions: input.permissions ?? {},
    is_owner: false,
    status: "active" as const,
  }
  if (sellerAdminId) {
    await marketplace.updateSellerAdmins({ id: sellerAdminId, ...fields } as any)
  } else {
    const a = await marketplace.createSellerAdmins({ seller_id: sellerId, ...fields } as any)
    sellerAdminId = (a as any).id
    created = true
  }

  // 3) Auth identity'yi bu çalışana bağla.
  try {
    await authService.updateAuthIdentities({
      id: authIdentityId,
      app_metadata: { ...existingMeta, seller_id: sellerAdminId },
    })
  } catch (e: any) {
    logger.error(`[StaffInvite] Auth identity bağlanamadı: ${e?.message}`)
    return { ok: false, reason: "auth_failed", message: "Giriş kimliği çalışana bağlanamadı." }
  }

  // 4) Şifre-belirleme token'ı üret → subscriber linkli e-posta atar.
  let token = ""
  try {
    const { result } = await generateResetPasswordTokenWorkflow(container).run({
      input: {
        entityId: email,
        actorType: "seller",
        provider: "emailpass",
        secret: process.env.JWT_SECRET as string,
      },
    })
    token = typeof result === "string" ? result : ""
  } catch (e: any) {
    logger.error(`[StaffInvite] Reset token üretilemedi: ${e?.message}`)
    return { ok: false, reason: "auth_failed", message: "Şifre belirleme bağlantısı üretilemedi." }
  }

  const reset_link = `${vendorPanelUrl()}/sifre-belirle?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  logger.info(`[StaffInvite] ${email} mağaza ${sellerId} çalışanı olarak ${created ? "eklendi" : "güncellendi"}.`)
  return { ok: true, seller_admin_id: sellerAdminId, email, created, reset_link }
}
