import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"

/** GET /vendors/me — giriş yapmış satıcı kullanıcısının satıcı bilgileri. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const actorId = (req as any).auth_context?.actor_id as string | undefined
  if (!actorId) return res.status(401).json({ message: "Yetkisiz." })

  const query = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "seller_admin",
    fields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "phone",
      "seller.*",
    ],
    filters: { id: actorId },
  })

  const sellerAdmin = data?.[0]
  if (!sellerAdmin) return res.status(404).json({ message: "Satıcı bulunamadı." })

  return res.json({ seller_admin: sellerAdmin, seller: (sellerAdmin as any).seller })
}

// Satıcının kendi düzenleyebileceği mağaza alanları (status/commission_rate HARİÇ).
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  account_holder: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  legal_name: z.string().optional().nullable(),
})

/** POST /vendors/me — satıcı kendi mağaza ayarlarını günceller. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const seller = await marketplace.updateSellers({ id: resolved.seller.id, ...parsed.data })
  return res.json({ seller })
}
