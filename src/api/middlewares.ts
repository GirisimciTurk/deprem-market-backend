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
  } catch (e: any) {
    // FAIL-CLOSED: yalnız ADMIN_ONLY uçlara uygulanır; rol çözümlenemezse güvenli
    // taraf REDDETMEKtir (deny-by-default).
    try { req.scope.resolve("logger").error(`[requireAdminRole] reddedildi: ${e?.message}`) } catch {}
    return res.status(403).json({ message: "Yetki doğrulanamadı, lütfen tekrar deneyin." })
  }
}

// Medusa yalnız /store,/admin,/auth route gruplarına otomatik CORS uygular; özel
// /vendors route'ları CORS ALMAZ → satıcı paneli (farklı origin: satici.depremtek.market)
// /vendors çağrılarında tarayıcı tarafından bloklanır. Bu middleware AUTH_CORS/STORE_CORS'taki
// izinli origin'ler için CORS başlıklarını ekler ve OPTIONS preflight'ı 204 ile yanıtlar.
const VENDOR_CORS_ORIGINS = (process.env.AUTH_CORS || process.env.STORE_CORS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

function vendorCors(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const origin = req.headers.origin as string | undefined
  if (origin && VENDOR_CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Credentials", "true")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "authorization,content-type")
  }
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  return next()
}

const ADMIN_ONLY_MATCHERS = [
  "/admin/promotions*",
  "/admin/customers*",
  "/admin/reseller-applications*",
  "/admin/sellers*",
  "/admin/seller-scorecards*",
  "/admin/seller-campaigns*",
  "/admin/cargo-tariff*",
  "/admin/cargo-setup",
  "/admin/seller-reviews*",
  "/admin/seller-returns*",
  "/admin/seller-contracts*",
  "/admin/product-approvals*",
  "/admin/product-questions*",
  "/admin/conversations*",
  "/admin/marketplace-setup",
  "/admin/settle-payouts",
  "/admin/commission-rules*",
  "/admin/invoices*",
  "/admin/storefront-settings*",
  "/admin/order-refunds*",
  // Stok/envanter mutasyonları (değer-etkili; kontrol merkezi modelinde satış
  // operasyonu satıcı panelinde, bunlar legacy) — yalnız admin.
  "/admin/stock-adjust*",
  "/admin/inventory-counts*",
  "/admin/inventory-transfers*",
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
      // Satıcı değerlendirmesi: giriş yapmışsa müşteri id'si eklenir, misafir de olur.
      method: ["POST"],
      matcher: "/store/seller-reviews",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      // Yorum fotoğrafı yükleme: base64 gövde büyük olabileceğinden body limiti yükseltilir.
      method: ["POST"],
      matcher: "/store/review-uploads",
      bodyParser: { sizeLimit: "12mb" },
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      // The customer's own reseller application(s) require a logged-in customer.
      method: ["GET"],
      matcher: "/store/reseller-applications/me",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // Sipariş satıcı-kargo bilgisi yalnız siparişin sahibi müşteriye açık.
      method: ["GET"],
      matcher: "/store/seller-shipments",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // İade talebi oluşturmak için giriş yapmış müşteri gerekir (sipariş sahipliği doğrulanır).
      method: ["POST"],
      matcher: "/store/return-requests",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // Web push abone/abonelikten-çık/stok-uyarı: giriş yapmışsa müşteri id'si
      // eklenir (sipariş bildirimleri için), misafir de abone olabilir.
      method: ["POST"],
      matcher: "/store/push/*",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      // Müşteri↔satıcı mesajlaşma: tüm uçlar giriş yapmış müşteri gerektirir
      // (her uçta ayrıca konuşma sahipliği doğrulanır).
      matcher: "/store/conversations",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/conversations/*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    // CORS: satıcı panelinin (farklı origin) /vendors çağrıları için. auth'tan ÖNCE
    // çalışmalı (OPTIONS preflight kimlik doğrulama gerektirmeden 204 dönmeli).
    { matcher: "/vendors", middlewares: [vendorCors] },
    { matcher: "/vendors/*", middlewares: [vendorCors] },
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
