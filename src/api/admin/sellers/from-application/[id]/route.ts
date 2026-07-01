import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { RESELLER_MODULE } from "../../../../../modules/reseller"
import ResellerModuleService from "../../../../../modules/reseller/service"
import { inviteSeller } from "../../../../../lib/seller-invite"

function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (
    (input || "")
      .toLowerCase()
      .replace(/[çğıöşü]/g, (c) => map[c] || c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || `satici-${Date.now()}`
  )
}

/**
 * POST /admin/sellers/from-application/:id — onaylanan başvurudan satıcı oluşturur,
 * başvuruyu 'approved' yapar VE panel girişi hazırlayıp "şifreni belirle" davet
 * e-postası gönderir (inviteSeller: auth hesabı + seller_admin + reset-token maili).
 *
 * İki tür de satıcı olur (ikisi de panel + havuz için satıcı hesabı gerektirir),
 * ama partner_type farklıdır:
 *   - "firma"  → partner_type="product": kendi mağazasında ürün satar.
 *   - "bayi"   → partner_type="service": hizmet ortağı; havuz talepleri buna gelir.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  const app = await reseller.retrieveResellerApplication(req.params.id).catch(() => null)
  if (!app) return res.status(404).json({ message: "Başvuru bulunamadı." })

  const isFirma =
    (app as { application_type?: string }).application_type === "firma"
  const partnerType = isFirma ? "product" : "service"

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  // handle benzersiz olmalı (unique). Aynı firma adı varsa kısa bir ek ile
  // çakışmayı önle (aksi halde unique-constraint 500 dönerdi).
  let handle = slugify(app.company_name)
  const existing = await marketplace
    .listSellers({ handle })
    .catch(() => [] as any[])
  if (existing && existing.length > 0) {
    handle = `${handle}-${String(app.id).slice(-4).toLowerCase()}`
  }
  const seller = await marketplace.createSellers({
    name: app.company_name,
    handle,
    legal_name: app.company_name,
    email: app.email || null,
    phone: app.phone || null,
    tax_number: app.tax_number || null,
    status: "active",
    commission_rate: 10,
    partner_type: partnerType,
  })

  await reseller.updateResellerApplications({ id: app.id, status: "approved" })

  // Panel girişi + şifre-belirleme daveti. Satıcı zaten oluştu; davet başarısız
  // olsa bile (ör. e-posta yok) 201 dönüyoruz, ama sonucu yanıta koyuyoruz ki
  // admin durumu görsün / reset_link'i (SMTP kapalıyken) elle iletebilsin.
  const invite = await inviteSeller(req.scope, seller.id)

  return res.status(201).json({
    seller,
    invite: invite.ok
      ? { sent: true, email: invite.email, reset_link: invite.reset_link }
      : { sent: false, reason: invite.reason, message: invite.message },
  })
}
