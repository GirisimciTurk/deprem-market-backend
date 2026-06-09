import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { RESELLER_MODULE } from "../../../modules/reseller"
import ResellerModuleService from "../../../modules/reseller/service"

/** GET /admin/reseller-applications?status=&q= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim().toLowerCase()

  const filters: Record<string, unknown> = {}
  if (status && ["pending", "approved", "rejected"].includes(status)) filters.status = status

  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  const [applications, count] = await reseller.listAndCountResellerApplications(filters, {
    order: { created_at: "DESC" },
    take: 500,
  })

  const filtered = q
    ? applications.filter(
        (a) =>
          a.company_name?.toLowerCase().includes(q) ||
          a.applicant_name?.toLowerCase().includes(q) ||
          a.email?.toLowerCase().includes(q) ||
          a.city?.toLowerCase().includes(q)
      )
    : applications

  return res.json({ applications: filtered, count })
}
