import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  createCustomerAccountWorkflow,
  setAuthAppMetadataWorkflow,
} from "@medusajs/core-flows"
import { googleLinkLimiter, enforceRateLimit } from "../../../../lib/rate-limiter"

/**
 * Links a freshly-authenticated Google identity to a customer account.
 *
 * The storefront calls this right after `sdk.auth.callback` when the Google
 * registration token has an empty `actor_id` (i.e. this Google identity is not
 * yet attached to a customer).
 *
 *  - If a registered customer already exists for the Google-verified email, the
 *    Google identity is linked to that existing customer. This avoids both the
 *    duplicate-account problem and the `(email, has_account)` unique-constraint
 *    error, and lets the same person use Google AND email/password for one
 *    account.
 *  - Otherwise a new customer account is created and linked (same result as the
 *    default `POST /store/customers` flow).
 *
 * SECURITY: the email is read from the verified Google profile stored on the
 * auth identity (`provider_identities[].user_metadata.email`) — never from the
 * request body — so a caller cannot link their Google login to someone else's
 * account by supplying an arbitrary email. The Google provider only persists
 * this profile after checking `email_verified`.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  if (await enforceRateLimit(googleLinkLimiter, req, res)) return

  const authContext = req.auth_context

  if (!authContext?.auth_identity_id) {
    return res.status(401).json({ message: "Yetkilendirme gerekli." })
  }

  // Already attached to a customer (returning user) → nothing to do.
  if (authContext.actor_id) {
    return res.json({
      status: "already_linked",
      customer_id: authContext.actor_id,
    })
  }

  const authModule = req.scope.resolve(Modules.AUTH)
  const customerModule = req.scope.resolve(Modules.CUSTOMER)

  const authIdentity = await authModule.retrieveAuthIdentity(
    authContext.auth_identity_id,
    { relations: ["provider_identities"] }
  )

  const googleIdentity = authIdentity.provider_identities?.find(
    (pi) => pi.provider === "google"
  )
  const email = (googleIdentity?.user_metadata as { email?: string } | undefined)
    ?.email

  if (!email) {
    return res
      .status(400)
      .json({ message: "Google profilinde doğrulanmış e-posta bulunamadı." })
  }

  // Existing registered customer with this verified email → link to it.
  const existing = await customerModule.listCustomers({
    email,
    has_account: true,
  })

  if (existing.length > 0) {
    const customerId = existing[0].id
    await setAuthAppMetadataWorkflow(req.scope).run({
      input: {
        authIdentityId: authContext.auth_identity_id,
        actorType: "customer",
        value: customerId,
      },
    })
    return res.json({ status: "linked", customer_id: customerId })
  }

  // No existing account → create one and link it.
  const { result } = await createCustomerAccountWorkflow(req.scope).run({
    input: {
      customerData: { email },
      authIdentityId: authContext.auth_identity_id,
    },
  })

  return res.json({ status: "created", customer_id: result.id })
}
