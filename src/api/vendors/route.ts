import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createSellerWorkflow } from "../../workflows/marketplace/create-seller"

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

const schema = z.object({
  name: z.string().min(1),
  legal_name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  account_holder: z.string().optional().nullable(),
  admin: z.object({
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    email: z.string().email(),
    phone: z.string().optional().nullable(),
  }),
})

/**
 * POST /vendors — satıcı self-service kaydı. Önce /auth/seller/emailpass/register
 * ile alınan token gönderilir; bu route satıcıyı 'pending' durumda oluşturur ve
 * auth kimliğini satıcı kullanıcısına bağlar. Admin onayıyla 'active' olur.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz satıcı verisi.", issues: parsed.error.issues })
  }
  const data = parsed.data
  const authIdentityId = (req as any).auth_context?.auth_identity_id as string | undefined

  const { result } = await createSellerWorkflow(req.scope).run({
    input: {
      seller: {
        name: data.name,
        handle: slugify(data.name),
        legal_name: data.legal_name ?? null,
        email: data.admin.email,
        phone: data.phone ?? null,
        tax_number: data.tax_number ?? null,
        iban: data.iban ?? null,
        account_holder: data.account_holder ?? null,
        status: "pending",
      },
      admin: data.admin,
      auth_identity_id: authIdentityId,
    },
  })

  return res.status(201).json({ seller: result.seller })
}
