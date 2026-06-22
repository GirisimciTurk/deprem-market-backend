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

/**
 * Var olan bir satıcıya, belirli izinlerle bir ÇALIŞAN (alt-hesap) + giriş kimliği
 * oluşturur ve /vendors/* uçlarını çağırmak için "seller" bearer token üretir.
 * RBAC/audit/presence E2E testleri için (davet akışını HTTP'den ayrı tutar).
 */
export async function createStaffWithToken(
  container: any,
  sellerId: string,
  opts: {
    email: string
    name?: string
    role?: string
    permissions: Record<string, "none" | "view" | "full">
    is_owner?: boolean
  }
) {
  const marketplace: any = container.resolve(MARKETPLACE_MODULE)
  const auth: any = container.resolve(Modules.AUTH)
  const config: any = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)

  const reg = await auth.register("emailpass", {
    body: { email: opts.email, password: "Test1234!" },
  })
  const authIdentityId = reg?.authIdentity?.id
  if (!authIdentityId) {
    throw new Error("staff auth.register başarısız: " + JSON.stringify(reg).slice(0, 200))
  }

  const admin = await marketplace.createSellerAdmins({
    email: opts.email,
    first_name: opts.name ?? "Çalışan",
    seller_id: sellerId,
    is_owner: opts.is_owner ?? false,
    role: opts.role ?? "custom",
    permissions: opts.permissions,
    status: "active",
  })

  await auth.updateAuthIdentities({
    id: authIdentityId,
    app_metadata: { seller_id: admin.id },
  })

  const token = generateJwtToken(
    {
      actor_id: admin.id,
      actor_type: "seller",
      auth_identity_id: authIdentityId,
      app_metadata: { seller_id: admin.id },
    },
    { secret: config.projectConfig.http.jwtSecret, expiresIn: "1h" }
  )

  return { sellerAdminId: admin.id, authIdentityId, token }
}

/**
 * Test ortamında bir admin (user) + giriş kimliği oluşturur ve /admin/* uçlarını
 * çağırmak için geçerli bir "user" bearer token üretir. requireAdminRole middleware'i
 * rolü user.metadata'dan okur; metadata yoksa admin sayılır → bu kullanıcı geçer.
 */
export async function createAdminWithToken(
  container: any,
  email = "admin-e2e@test.local"
) {
  const auth: any = container.resolve(Modules.AUTH)
  const userSvc: any = container.resolve(Modules.USER)
  const config: any = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)

  const user = await userSvc.createUsers({ email, first_name: "E2E", last_name: "Admin" })
  const reg = await auth.register("emailpass", {
    body: { email, password: "Test1234!" },
  })
  const authIdentityId = reg?.authIdentity?.id
  if (!authIdentityId) {
    throw new Error("admin auth.register başarısız: " + JSON.stringify(reg).slice(0, 200))
  }
  await auth.updateAuthIdentities({
    id: authIdentityId,
    app_metadata: { user_id: user.id },
  })
  const token = generateJwtToken(
    {
      actor_id: user.id,
      actor_type: "user",
      auth_identity_id: authIdentityId,
      app_metadata: { user_id: user.id },
    },
    { secret: config.projectConfig.http.jwtSecret, expiresIn: "1h" }
  )
  return { user, token }
}

/**
 * Boş test DB'sinde checkout için gereken ticaret ortamını kurar:
 * satış kanalı + yayınlanabilir anahtar + Türkiye region (try) + stok lokasyonu +
 * kargo (fulfillment set/service zone/shipping option) + fiyatlı/stoklu yayında ürün.
 * Ürün opsiyonel olarak bir satıcıya bağlanır (marketplace zinciri testi için).
 */
export async function seedCommerce(container: any, opts: { sellerId?: string } = {}) {
  const {
    createSalesChannelsWorkflow,
    createApiKeysWorkflow,
    linkSalesChannelsToApiKeyWorkflow,
    createRegionsWorkflow,
    createStockLocationsWorkflow,
    createShippingProfilesWorkflow,
    createShippingOptionsWorkflow,
    createProductsWorkflow,
    createInventoryLevelsWorkflow,
  } = await import("@medusajs/core-flows")

  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  const salesChannelSvc = container.resolve(Modules.SALES_CHANNEL)

  // 1) Satış kanalı
  let sc = (await salesChannelSvc.listSalesChannels({}, { take: 1 }))[0]
  if (!sc) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    })
    sc = result[0]
  }

  // 2) Region (Türkiye, try)
  const { result: regions } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        { name: "Türkiye", currency_code: "try", countries: ["tr"], payment_providers: ["pp_system_default"] },
      ],
    },
  })
  const region = regions[0]

  // 3) Yayınlanabilir anahtar + kanala bağla
  const { result: keys } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ title: "Storefront", type: "publishable", created_by: "test" }] },
  })
  const pubKey = keys[0].token
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: keys[0].id, add: [sc.id] },
  })

  // 4) Stok lokasyonu
  const { result: locs } = await createStockLocationsWorkflow(container).run({
    input: { locations: [{ name: "Ana Depo", address: { city: "İstanbul", country_code: "tr", address_1: "Depo Cd. 1" } }] },
  })
  const location = locs[0]

  // 5) Lokasyon → manuel fulfillment provider
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  })

  // 5b) Satış kanalı → stok lokasyonu (YOKSA /store/shipping-options BOŞ döner)
  await link.create({
    [Modules.SALES_CHANNEL]: { sales_channel_id: sc.id },
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
  })

  // 6) Kargo profili (default)
  let profile = (await fulfillment.listShippingProfiles({ type: "default" }))[0]
  if (!profile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default", type: "default" }] },
    })
    profile = result[0]
  }

  // 7) Fulfillment set + service zone (Türkiye) + lokasyona bağla
  const fset = await fulfillment.createFulfillmentSets({
    name: "Kargo",
    type: "shipping",
    service_zones: [{ name: "Türkiye", geo_zones: [{ country_code: "tr", type: "country" }] }],
  })
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fset.id },
  })

  // 8) Shipping option
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standart Kargo",
        service_zone_id: fset.service_zones[0].id,
        shipping_profile_id: profile.id,
        provider_id: "manual_manual",
        price_type: "flat",
        type: { label: "Standart", description: "2-3 gün", code: "standard" },
        prices: [
          { currency_code: "try", amount: 5000 },
          { region_id: region.id, amount: 5000 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        // İade kargo option'ı (return-requests bunu arar; yoksa iade 500 verir)
        name: "İade Kargo",
        service_zone_id: fset.service_zones[0].id,
        shipping_profile_id: profile.id,
        provider_id: "manual_manual",
        price_type: "flat",
        type: { label: "İade", description: "İade kargosu", code: "return" },
        prices: [
          { currency_code: "try", amount: 0 },
          { region_id: region.id, amount: 0 },
        ],
        rules: [
          { attribute: "is_return", value: "true", operator: "eq" },
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
        ],
      },
    ],
  })

  // 9) Yayında, fiyatlı, stoklu ürün (satış kanalında)
  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Checkout Test Ürünü",
          status: "published",
          shipping_profile_id: profile.id,
          options: [{ title: "Model", values: ["Tek"] }],
          sales_channels: [{ id: sc.id }],
          variants: [
            {
              title: "Tek",
              sku: "CHK-1",
              manage_inventory: true,
              options: { Model: "Tek" },
              prices: [{ currency_code: "try", amount: 10000 }],
            },
          ],
        },
      ],
    },
  })
  const product = products[0]
  const variant = product.variants[0]

  // Stok seviyesi
  const { data: vrows } = await query.graph({
    entity: "variant",
    fields: ["inventory_items.inventory_item_id"],
    filters: { id: variant.id },
  })
  const invItemId = (vrows[0] as any).inventory_items[0].inventory_item_id
  await createInventoryLevelsWorkflow(container).run({
    input: { inventory_levels: [{ inventory_item_id: invItemId, location_id: location.id, stocked_quantity: 100 }] },
  })

  // Opsiyonel: ürünü satıcıya bağla (marketplace zinciri için)
  if (opts.sellerId) {
    await link.create({
      [MARKETPLACE_MODULE]: { seller_id: opts.sellerId },
      [Modules.PRODUCT]: { product_id: product.id },
    })
  }

  return { pubKey, regionId: region.id, salesChannelId: sc.id, product, variantId: variant.id, locationId: location.id }
}
