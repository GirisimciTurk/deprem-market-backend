import { MARKETPLACE_MODULE } from "../modules/marketplace"
import type MarketplaceModuleService from "../modules/marketplace/service"
import { RESELLER_MODULE } from "../modules/reseller"
import type ResellerModuleService from "../modules/reseller/service"

function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "")
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "satici"
  )
}

/**
 * Onaylanmış bir bayilik başvurusundan otomatik satıcı hesabı açar ve başvuruya
 * bağlar. İdempotent: `application.seller_id` doluysa yeni satıcı açmaz.
 *
 * "firma" (Firmamız Ol) → partner_type "product" (kendi ürünlerini satar).
 * "bayi"  (Bayimiz Ol)  → partner_type "service" (hizmet/talep ortağı).
 *
 * Not: Satıcının panele giriş yapabilmesi için ayrıca login daveti gerekir
 * (admin tarafından açılan satıcılarla aynı akış). Bu adım yalnız satıcı KAYDINI
 * oluşturur — manuel "satıcıya çevirme" işini ortadan kaldırır.
 */
export async function provisionSellerFromApplication(
  scope: any,
  application: any
): Promise<string | null> {
  if (!application) return null
  if (application.seller_id) return application.seller_id // zaten açılmış

  const service: MarketplaceModuleService = scope.resolve(MARKETPLACE_MODULE)
  const reseller: ResellerModuleService = scope.resolve(RESELLER_MODULE)

  const base = slugify(application.company_name || application.applicant_name || "satici")
  let handle = base
  try {
    const existing = await service.listSellers({ handle })
    if (existing && existing.length > 0) {
      const suffix = String(application.id).replace(/[^a-z0-9]/gi, "").slice(-6).toLowerCase()
      handle = `${base}-${suffix || "1"}`
    }
  } catch {
    /* liste hatası → base handle ile devam (createSellers unique çakışmada hata verir) */
  }

  const partner_type = application.application_type === "firma" ? "product" : "service"

  const seller = await service.createSellers({
    name: application.company_name || application.applicant_name || "Satıcı",
    handle,
    email: application.email || null,
    phone: application.phone || null,
    tax_number: application.tax_number || null,
    partner_type,
    // Başvuru onaylandığı için aktif — satış/hizmet yapabilir (login daveti ayrı).
    status: "active",
  })

  await reseller.updateResellerApplications({ id: application.id, seller_id: seller.id })
  return seller.id
}
