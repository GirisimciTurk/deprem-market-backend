import {
  Modules,
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"

/**
 * Test ortamında AKTİF bir satıcı + giriş kimliği + seller_admin oluşturur ve
 * /vendors/* uçlarını çağırmak için geçerli bir "seller" bearer token üretir.
 * Üretim wiring'inin (seller-invite.ts) aynısı: seller → auth identity →
 * seller_admin → app_metadata.seller_id = sellerAdminId → JWT actor_id = sellerAdminId.
 */
export async function createSellerWithToken(
  container: any,
  opts: { name?: string; handle: string; email: string }
) {
  const marketplace: any = container.resolve(MARKETPLACE_MODULE)
  const auth: any = container.resolve(Modules.AUTH)
  const config: any = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)

  const seller = await marketplace.createSellers({
    name: opts.name ?? "Test Satıcı",
    handle: opts.handle,
    legal_name: "Test Satıcı A.Ş.",
    tax_number: "1234567890",
    email: opts.email,
    phone: "02160000000",
    status: "active",
    commission_rate: 10,
  })

  const reg = await auth.register("emailpass", {
    body: { email: opts.email, password: "Test1234!" },
  })
  const authIdentityId = reg?.authIdentity?.id
  if (!authIdentityId) {
    throw new Error("auth.register başarısız: " + JSON.stringify(reg).slice(0, 200))
  }

  const sellerAdmin = await marketplace.createSellerAdmins({
    email: opts.email,
    first_name: opts.name ?? "Test",
    seller_id: seller.id,
  })

  await auth.updateAuthIdentities({
    id: authIdentityId,
    app_metadata: { seller_id: sellerAdmin.id },
  })

  const token = generateJwtToken(
    {
      actor_id: sellerAdmin.id,
      actor_type: "seller",
      auth_identity_id: authIdentityId,
      app_metadata: { seller_id: sellerAdmin.id },
    },
    { secret: config.projectConfig.http.jwtSecret, expiresIn: "1h" }
  )

  return { seller, sellerAdminId: sellerAdmin.id, authIdentityId, token }
}

export const authHeader = (token: string) => ({
  headers: { authorization: `Bearer ${token}` },
})
