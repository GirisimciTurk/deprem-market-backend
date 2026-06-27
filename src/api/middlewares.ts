import {
  authenticate,
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { resolveSeller } from "./vendors/_lib/resolve-seller"
import { requiredPermissionFor, can } from "../lib/seller-permissions"
import {
  logSellerAction,
  describeVendorAction,
  entityIdFromPath,
} from "../lib/seller-audit"

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

// Audit'e YAZILMAYACAK segment/alt-eylemler (gürültü / AI yardımcıları):
const AUDIT_SKIP_SEGMENTS = new Set([
  "notifications",
  "uploads",
  "generate-listing",
  "generate-block-text",
  "suggest-category",
  "scorecard",
  "presence", // eşzamanlı çalışma heartbeat'i — ~15 sn'de bir, audit'e yazılmaz
])
const AUDIT_SKIP_SUBS = new Set(["draft", "coach"])

/**
 * Satıcı paneli RBAC + otomatik sistem kaydı (audit). authenticate'ten SONRA çalışır.
 *  1) Çalışanın oturum bağlamını çözer; askıya alınmışsa (disabled) 403.
 *  2) İstenen bölüm için izin yetersizse 403 (deny-by-default değil; eşlenmemiş uç serbest).
 *  3) Başarılı YAZMA isteklerini "kim, ne zaman, ne yaptı" olarak audit'e yazar.
 */
async function vendorAccessControl(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  let resolved
  try {
    resolved = await resolveSeller(req)
  } catch (e: any) {
    try { req.scope.resolve("logger").error(`[vendorAccessControl] çözümleme hatası: ${e?.message}`) } catch {}
    return res.status(401).json({ message: "Yetkisiz." })
  }
  // Seller bağlamı yoksa (ör. henüz satıcısı olmayan kimlik) route kendi 401/404'ünü versin.
  if (!resolved) return next()

  // Askıya alınmış çalışan giriş yapamaz.
  if (resolved.admin.status === "disabled") {
    return res.status(403).json({ message: "Hesabınız askıya alınmış. Mağaza sahibine başvurun." })
  }

  // Tam yol: middleware /vendors'a mount edildiğinden req.path göreli ("/...")
  // olur → /vendors önekini içeren originalUrl (yoksa baseUrl+path) kullanılır.
  const fullPath = req.originalUrl || `${(req as any).baseUrl || ""}${req.path || ""}`

  // İzin kontrolü.
  const required = requiredPermissionFor(req.method, fullPath)
  if (required && !can(resolved.admin, required.section, required.level)) {
    return res.status(403).json({
      message: "Bu işlem için yetkiniz yok. Mağaza sahibinden izin isteyin.",
      required,
    })
  }

  // Otomatik audit: yalnız mutasyon isteklerini, başarılı yanıtta kaydet.
  const method = req.method.toUpperCase()
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method)
  if (isWrite) {
    const path = fullPath
    const parts = (path.split("/vendors/")[1] || "").split(/[?#]/)[0].split("/").filter(Boolean)
    const seg = parts[0] || ""
    const lastSub = parts[parts.length - 1]
    const skip = AUDIT_SKIP_SEGMENTS.has(seg) || AUDIT_SKIP_SUBS.has(lastSub)
    if (!skip) {
      let captured: any
      const origJson = res.json.bind(res)
      ;(res as any).json = (body: any) => {
        captured = body
        return origJson(body)
      }
      res.on("finish", () => {
        if (res.statusCode >= 400) return
        const { action, summary, entityType } = describeVendorAction(method, path)
        // entity id: yol parametresi → yoksa yanıt gövdesindeki üst düzey id.
        let entityId = entityIdFromPath(path)
        if (!entityId && captured && typeof captured === "object") {
          const firstObj = Object.values(captured).find(
            (v) => v && typeof v === "object" && (v as any).id
          ) as any
          entityId = firstObj?.id ?? captured.id ?? null
        }
        void logSellerAction(req.scope, {
          sellerId: resolved!.seller.id,
          actor: {
            adminId: resolved!.admin.id,
            name: [resolved!.admin.first_name, resolved!.admin.last_name].filter(Boolean).join(" ") || null,
            email: resolved!.admin.email,
          },
          action,
          summary,
          entityType,
          entityId,
          method,
          path,
          status: res.statusCode,
        })
      })
    }
  }

  return next()
}

const ADMIN_ONLY_MATCHERS = [
  "/admin/promotions*",
  "/admin/customers*",
  "/admin/reseller-applications*",
  "/admin/expert-leads*",
  "/admin/sellers*",
  "/admin/seller-scorecards*",
  "/admin/seller-campaigns*",
  "/admin/cargo-tariff*",
  "/admin/cargo-setup",
  "/admin/seller-reviews*",
  "/admin/seller-returns*",
  "/admin/seller-contracts*",
  "/admin/contract-setup",
  "/admin/havar-requests*",
  "/admin/product-approvals*",
  "/admin/product-questions*",
  "/admin/conversations*",
  "/admin/marketplace-setup",
  "/admin/settle-payouts",
  // Özel hizmet talepleri (atama + ödeme/komisyon/payout) — para-etkili, yalnız admin.
  "/admin/service-requests*",
  "/admin/commission-rules*",
  "/admin/category-attributes*",
  "/admin/brands*",
  "/admin/invoices*",
  "/admin/storefront-settings*",
  "/admin/order-refunds*",
  // AI doğal-dil analitiği — tüm satıcıların ciro/iade verisini gösterir, yalnız admin.
  "/admin/ai-insights",
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
      // Özel hizmet talepleri: giriş yapmışsa müşteri id'si bağlanır (takip için),
      // misafir de keşif talebi açabilir.
      matcher: "/store/service-requests",
      middlewares: [
        authenticate("customer", ["session", "bearer"], {
          allowUnauthenticated: true,
        }),
      ],
    },
    {
      // Talep detayı + teklif kararı (kabul/red): yalnız giriş yapmış sahibi.
      matcher: "/store/service-requests/*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
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
      // Görsel yükleme: base64 gövde büyük olabilir → body limiti yükseltilir
      // (varsayılan 100KB yetmez; tek-ürün ve toplu yükleme görselleri buradan geçer).
      method: ["POST"],
      matcher: "/vendors/uploads",
      bodyParser: { sizeLimit: "75mb" },
      middlewares: [],
    },
    {
      // Toplu ürün yükleme: 500 satıra kadar JSON gövde → body limiti yükseltilir.
      method: ["POST"],
      matcher: "/vendors/products/bulk",
      bodyParser: { sizeLimit: "5mb" },
      middlewares: [],
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
      // Diğer tüm satıcı uçları giriş yapmış satıcı gerektirir + RBAC/audit.
      matcher: "/vendors/*",
      middlewares: [
        authenticate("seller", ["bearer", "session"]),
        vendorAccessControl,
      ],
    },
    // RBAC: hassas admin uçları yalnızca 'admin' rolüne açık.
    ...ADMIN_ONLY_MATCHERS.map((matcher) => ({
      matcher,
      middlewares: [requireAdminRole],
    })),
  ],
})
