import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

/**
 * Güvenlik: JWT/COOKIE secret production'da ZORUNLU. Tanımlı değilse fail-closed
 * (başlatma hatası) — eskiden bilinen public "supersecret" varsayılanına düşüyordu,
 * bu da token sahteleme riskiydi. Geliştirmede sabit ama "supersecret"ten farklı bir
 * değere düşer (gerçek değer zaten .env'den gelir).
 */
function requiredSecret(name: string, value: string | undefined): string {
  if (value && value.trim()) return value
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error(
      `[güvenlik] ${name} ortam değişkeni production'da zorunludur; varsayılan secret kullanılamaz.`
    )
  }
  return `dev-only-insecure-${name.toLowerCase()}`
}

// Dosya depolama: AWS S3 (veya S3-uyumlu: R2/MinIO) kimlik bilgileri tanımlıysa S3'e,
// değilse mevcut yerel webp provider'ına düşer. Böylece .env'e bilgiler eklenene kadar
// hiçbir şey bozulmaz; eklenince yeni yüklemeler otomatik S3'e gider.
const USE_S3 = !!(
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY
)

const fileProvider = USE_S3
  ? {
      // webp-s3: görseli ÖNCE WebP'e çevirir, SONRA R2/S3'e yükler (file-s3 webp yapmaz).
      resolve: "./src/modules/file/providers/webp-s3",
      id: "webp-s3",
      options: {
        file_url: process.env.S3_FILE_URL, // ör: https://<bucket>.s3.<region>.amazonaws.com
        access_key_id: process.env.S3_ACCESS_KEY_ID,
        secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
        region: process.env.S3_REGION, // ör: eu-central-1
        bucket: process.env.S3_BUCKET,
        // endpoint yalnız S3-uyumlu sağlayıcılar (Cloudflare R2/MinIO) için; AWS'de boş bırak.
        ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
        ...(process.env.S3_PREFIX ? { prefix: process.env.S3_PREFIX } : {}),
      },
    }
  : {
      resolve: "./src/modules/file/providers/webp-local",
      id: "webp-local",
      options: {
        upload_dir: "static",
        backend_url: process.env.BACKEND_URL
          ? `${process.env.BACKEND_URL}/static`
          : "http://localhost:9000/static",
      },
    }

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: requiredSecret("JWT_SECRET", process.env.JWT_SECRET),
      cookieSecret: requiredSecret("COOKIE_SECRET", process.env.COOKIE_SECRET),
    }
  },
  // Medusa'nın yerleşik admin paneli (/app) KULLANILMIYOR — özel admin paneli
  // (admin.depremtek.market) var. Yalnız yerleşik UI'ı kapatır; `/admin/*` API'leri
  // (özel panel, auth, hizmet/payout route'ları) ÇALIŞMAYA DEVAM EDER. Bonus: backend
  // build'i admin UI'ını derlemediği için hızlanır.
  admin: {
    disable: true,
  },
  modules: {
    // Üretim/ölçek altyapısı: in-memory yerine Redis. REDIS_URL zaten bağlı.
    //  - EVENT_BUS: event'ler kalıcı/yeniden-denenebilir olur (süreç çökse de mail/sipariş
    //    event'i kaybolmaz; çok-sunucuda tutarlı). Local event bus üretim için önerilmez.
    //  - WORKFLOW_ENGINE: uzun/çok-adımlı workflow'lar (ödeme, fulfillment, iade) kalıcı durumla
    //    çalışır, restart sonrası kaldığı yerden devam/retry edebilir.
    //  - CACHE: çok-sunucuda paylaşımlı cache.
    // YALNIZCA REDIS_URL tanımlıysa yüklenir; yoksa Medusa varsayılan IN-MEMORY
    // modülleri kullanır (Redis'siz lokal dev + entegrasyon testleri için). Prod'da
    // REDIS_URL dolu olduğundan davranış değişmez.
    ...(process.env.REDIS_URL
      ? {
          [Modules.EVENT_BUS]: {
            resolve: "@medusajs/event-bus-redis",
            options: { redisUrl: process.env.REDIS_URL },
          },
          [Modules.WORKFLOW_ENGINE]: {
            resolve: "@medusajs/workflow-engine-redis",
            options: { redis: { redisUrl: process.env.REDIS_URL } },
          },
          [Modules.CACHE]: {
            resolve: "@medusajs/cache-redis",
            options: { redisUrl: process.env.REDIS_URL },
          },
        }
      : {}),
    [Modules.FILE]: {
      resolve: "@medusajs/file",
      options: {
        providers: [fileProvider],
      },
    },
    [Modules.FULFILLMENT]: {
      resolve: "@medusajs/fulfillment",
      options: {
        providers: [
          {
            // Manuel fulfillment (mevcut veriler `manual_manual` provider'ına bağlı).
            resolve: "@medusajs/fulfillment-manual",
            id: "manual",
          },
          {
            // Yurtiçi Kargo — provider_id: "yurtici_kargo" (identifier "yurtici" + id "kargo").
            resolve: "./src/modules/fulfillment/providers/yurtici-kargo",
            id: "kargo",
            options: {},
          },
        ],
      },
    },
    [Modules.PAYMENT]: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/payment/providers/iyzico-mock",
            id: "iyzico-mock",
            options: {},
          },
          {
            // PayTR Pazaryeri (sub-merchant + escrow). Kimlik bilgileri .env'de
            // (PAYTR_MERCHANT_ID/KEY/SALT); yoksa provider yüklenir ama çağrılar
            // fail-closed (lib/paytr-config) döner.
            resolve: "./src/modules/payment/providers/paytr",
            id: "paytr",
            options: {},
          },
        ],
      },
    },
    [Modules.AUTH]: {
      resolve: "@medusajs/auth",
      options: {
        providers: [
          {
            resolve: "@medusajs/auth-emailpass",
            id: "emailpass",
            options: {},
          },
          {
            resolve: "@medusajs/auth-google",
            id: "google",
            options: {
              clientId: process.env.GOOGLE_CLIENT_ID || "placeholder",
              clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder",
              callbackUrl: process.env.GOOGLE_CALLBACK_URL || "http://localhost:9000/auth/customer/google/callback",
            },
          },
        ],
      },
    },
    storefrontSettings: {
      resolve: "./src/modules/storefrontSettings",
    },
    review: {
      resolve: "./src/modules/review",
    },
    blog: {
      resolve: "./src/modules/blog",
    },
    reseller: {
      resolve: "./src/modules/reseller",
    },
    expert_lead: {
      // Uzman (inşaat mühendisi) ön-kayıt / ilgi formu — doğrulanmış dizinin tohumu.
      resolve: "./src/modules/expert_lead",
    },
    havar: {
      resolve: "./src/modules/havar",
    },
    service_request: {
      // Özel hizmet (keşif→teklif→onay→tedarik→montaj→kabul) talep/proje modülü.
      // havar (drone) modülünden ayrı; fiziki kurulum hizmetleri için.
      resolve: "./src/modules/service_request",
    },
    stock_movement: {
      resolve: "./src/modules/stock_movement",
    },
    marketplace: {
      resolve: "./src/modules/marketplace",
    },
    invoicing: {
      resolve: "./src/modules/invoicing",
    },
    push: {
      resolve: "./src/modules/push",
    },
    analytics: {
      // Müşteri davranış olayları (product_view/search/add_to_cart/.../purchase)
      // — first-party analitik + öneri/segment/sepet-kurtarma için temel.
      resolve: "./src/modules/analytics",
    },
  },
})
