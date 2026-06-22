import { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export type ResolvedSeller = {
  sellerAdminId: string
  // Giriş yapan satıcı kullanıcısının yetki bağlamı (RBAC + audit için).
  admin: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    is_owner: boolean
    role: string | null
    permissions: Record<string, "none" | "view" | "full"> | null
    status: "active" | "disabled"
  }
  seller: {
    id: string
    name: string
    handle: string
    status: "pending" | "active" | "suspended"
    commission_rate: number
    is_house: boolean
    [key: string]: any
  }
}

/**
 * Giriş yapmış satıcı kullanıcısının (actor_type "seller") seller kaydını çözer.
 * auth_context.actor_id → seller_admin.id → seller.
 * Bulunamazsa null döner (route 401/404 ile yanıtlamalı).
 */
export async function resolveSeller(req: MedusaRequest): Promise<ResolvedSeller | null> {
  const actorId = (req as any).auth_context?.actor_id as string | undefined
  if (!actorId) return null

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "seller_admin",
    fields: [
      "id",
      "first_name",
      "last_name",
      "email",
      "is_owner",
      "role",
      "permissions",
      "status",
      "seller.id",
      "seller.name",
      "seller.legal_name",
      "seller.handle",
      "seller.status",
      "seller.commission_rate",
      "seller.is_house",
      "seller.email",
      "seller.phone",
      "seller.logo",
      "seller.description",
      "seller.iban",
      "seller.account_holder",
      "seller.tax_number",
      "seller.default_carrier",
      "seller.rating_sum",
      "seller.rating_count",
    ],
    filters: { id: actorId },
  })

  const sellerAdmin = data?.[0] as any
  if (!sellerAdmin?.seller?.id) return null

  return {
    sellerAdminId: sellerAdmin.id,
    admin: {
      id: sellerAdmin.id,
      first_name: sellerAdmin.first_name ?? null,
      last_name: sellerAdmin.last_name ?? null,
      email: sellerAdmin.email ?? null,
      is_owner: !!sellerAdmin.is_owner,
      role: sellerAdmin.role ?? null,
      permissions: sellerAdmin.permissions ?? null,
      status: sellerAdmin.status ?? "active",
    },
    seller: sellerAdmin.seller,
  }
}
