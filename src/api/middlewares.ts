import {
  authenticate,
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"

/**
 * RBAC backend enforcement: 'staff' rolündeki admin kullanıcılarını hassas admin
 * uçlarından (promosyon, müşteri, bayilik, mağaza ayarları, para iadesi) 403 ile
 * engeller. Rol Medusa user `metadata.role`'den okunur (yoksa 'admin' = tam yetki).
 * UI tarafı (roles.ts / RoleGuard) ile aynı kuralı uygular.
 */
async function requireAdminRole(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const actorId = (req as any).auth_context?.actor_id as string | undefined
    if (!actorId) return next() // kimlik doğrulama zaten authenticate ile yapılır

    const query = req.scope.resolve("query")
    const { data } = await query.graph({
      entity: "user",
      fields: ["id", "metadata"],
      filters: { id: actorId },
    })
    const role = (data?.[0]?.metadata as any)?.role
    if (role === "staff") {
      return res.status(403).json({
        message: "Bu işlem için yetkiniz yok. Yönetici (admin) rolü gerekir.",
      })
    }
    return next()
  } catch {
    // Rol çözümlenemezse akışı bloklama (auth zaten korur).
    return next()
  }
}

const ADMIN_ONLY_MATCHERS = [
  "/admin/promotions*",
  "/admin/customers*",
  "/admin/reseller-applications*",
  "/admin/sellers*",
  "/admin/product-approvals*",
  "/admin/storefront-settings*",
  "/admin/order-refunds*",
]

export default defineMiddlewares({
  routes: [
    {
      // Google account-linking: accepts the Google *registration* token
      // (actor_id empty) so it can attach the identity to a customer.
      method: ["POST"],
      matcher: "/store/customers/google-link",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnregistered: true,
        }),
      ],
    },
    {
      // Submitting a review: attach the customer id when logged in, but still
      // allow guest submissions.
      method: ["POST"],
      matcher: "/store/reviews",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      // The customer's own reviews require a logged-in customer.
      method: ["GET"],
      matcher: "/store/reviews/me",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // The customer's own reseller application(s) require a logged-in customer.
      method: ["GET"],
      matcher: "/store/reseller-applications/me",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // İade talebi oluşturmak için giriş yapmış müşteri gerekir (sipariş sahipliği doğrulanır).
      method: ["POST"],
      matcher: "/store/return-requests",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // Satıcı (bayi) self-service kaydı: /auth/seller/emailpass/register'dan
      // gelen kayıt token'ını kabul eder (henüz actor yok) → satıcı oluşturulur.
      method: ["POST"],
      matcher: "/vendors",
      middlewares: [
        authenticate("seller", ["bearer"], { allowUnregistered: true }),
      ],
    },
    {
      // Diğer tüm satıcı uçları giriş yapmış satıcı gerektirir.
      matcher: "/vendors/*",
      middlewares: [authenticate("seller", ["bearer", "session"])],
    },
    // RBAC: hassas admin uçları yalnızca 'admin' rolüne açık.
    ...ADMIN_ONLY_MATCHERS.map((matcher) => ({
      matcher,
      middlewares: [requireAdminRole],
    })),
  ],
})
