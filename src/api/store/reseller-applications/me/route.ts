import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RESELLER_MODULE } from "../../../../modules/reseller"
import ResellerModuleService from "../../../../modules/reseller/service"

/**
 * GET /store/reseller-applications/me
 * Giriş yapmış müşterinin (e-postasıyla eşleşen) bayilik başvurularını döner.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Giriş gerekli." })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["email"],
    filters: { id: customerId },
  })
  const email = customers?.[0]?.email
  if (!email) return res.json({ applications: [] })

  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)
  const applications = await reseller.listResellerApplications(
    { email },
    { order: { created_at: "DESC" } }
  )

  return res.json({ applications })
}
