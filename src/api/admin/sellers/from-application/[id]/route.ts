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
 * POST /admin/sellers/from-application/:id — onaylanan bayilik başvurusundan
 * satıcı oluşturur, başvuruyu 'approved' yapar VE bayiye panel girişi hazırlayıp
 * "şifreni belirle" davet e-postası gönderir (inviteSeller: auth hesabı +
 * seller_admin + reset-token maili). Bu davet olmadan oluşturulan satıcının auth
 * hesabı olmadığından panele giriş YAPAMIYOR, dolayısıyla dükkanını açamıyordu.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  const app = await reseller.retrieveResellerApplication(req.params.id).catch(() => null)
  if (!app) return res.status(404).json({ message: "Başvuru bulunamadı." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const seller = await marketplace.createSellers({
    name: app.company_name,
    handle: slugify(app.company_name),
    legal_name: app.company_name,
    email: app.email || null,
    phone: app.phone || null,
    tax_number: app.tax_number || null,
    status: "active",
    commission_rate: 10,
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
