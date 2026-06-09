import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: {
    [Modules.FILE]: {
      resolve: "@medusajs/file",
      options: {
        providers: [
          {
            resolve: "./src/modules/file/providers/webp-local",
            id: "webp-local",
            options: {
              upload_dir: "static",
              backend_url: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/static` : "http://localhost:9000/static",
            },
          },
        ],
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
            // Aras Kargo — provider_id: "aras_kargo" (identifier "aras" + id "kargo").
            resolve: "./src/modules/fulfillment/providers/aras-kargo",
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
            resolve: "./src/modules/payment/providers/paynkolay",
            id: "paynkolay",
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
  },
})
