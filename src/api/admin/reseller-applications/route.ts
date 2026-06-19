import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { RESELLER_MODULE } from "../../../modules/reseller"
import ResellerModuleService from "../../../modules/reseller/service"
import { validateTaxId } from "../../../lib/tax-id"

/** GET /admin/reseller-applications?status=&q=&limit=&offset= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  // Filtreler DB seviyesinde uygulanır — arama da DB'de (ILIKE) yapılır ki sayfa
  // sınırının ötesindeki kayıtlar da bulunabilsin (eski hâl: take:500 + bellekte filter).
  const filters: Record<string, unknown> = {}
  if (status && ["pending", "approved", "rejected"].includes(status)) filters.status = status
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { company_name: { $ilike: like } },
      { applicant_name: { $ilike: like } },
      { email: { $ilike: like } },
      { city: { $ilike: like } },
    ]
  }

  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  const [applications, count] = await reseller.listAndCountResellerApplications(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Otomatik vergi no kontrolü (offline VKN/TCKN sağlaması) — admin'e işaret verir.
  const decorated = (applications as any[]).map((a) => ({
    ...a,
    tax_number_check: validateTaxId(a.tax_number),
  }))

  return res.json({ applications: decorated, count, offset, limit })
}
