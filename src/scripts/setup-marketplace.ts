import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { splitOrder } from "../lib/split-order"

/**
 * Pazar yeri başlangıç kurulumu (idempotent):
 *  1. Birinci-parti "Deprem Market" satıcısını (is_house, komisyon %0, aktif) oluşturur.
 *  2. Satıcısı olmayan tüm mevcut ürünleri bu house satıcıya bağlar.
 *
 * Çalıştır: npm run setup:marketplace
 */
const HOUSE_HANDLE = "deprem-market"

export default async function setupMarketplace({ container }: { container: MedusaContainer }) {
  const logger = container.resolve("logger")
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)

  // --- 1. House satıcı (idempotent) --------------------------------------
  const [existing] = await marketplace.listSellers({ handle: HOUSE_HANDLE }, { take: 1 })
  let house = existing
  if (!house) {
    house = await marketplace.createSellers({
      handle: HOUSE_HANDLE,
      name: "Deprem Market",
      legal_name: "Deprem Market",
      status: "active",
      commission_rate: 0,
      is_house: true,
    })
    logger.info(`[setup-marketplace] House satıcı oluşturuldu: ${house.id}`)
  } else {
    logger.info(`[setup-marketplace] House satıcı zaten var: ${house.id}`)
  }

  // --- 2. Satıcısı olmayan ürünleri house'a bağla ------------------------
  // Halihazırda herhangi bir satıcıya bağlı ürün id'lerini topla.
  const { data: linkedRows } = await query.graph({
    entity: "product",
    fields: ["id", "seller.id"],
  })
  const alreadyLinked = new Set(
    linkedRows.filter((p: any) => p.seller?.id).map((p: any) => p.id)
  )

  const toLink = linkedRows
    .map((p: any) => p.id)
    .filter((id: string) => !alreadyLinked.has(id))

  if (toLink.length === 0) {
    logger.info("[setup-marketplace] Bağlanacak ürün yok (hepsi bir satıcıya bağlı).")
  } else {
    await link.create(
      toLink.map((product_id: string) => ({
        [MARKETPLACE_MODULE]: { seller_id: house.id },
        [Modules.PRODUCT]: { product_id },
      }))
    )
    logger.info(
      `[setup-marketplace] ${toLink.length} ürün '${house.name}' satıcısına bağlandı.`
    )
  }

  // --- 3. Geçmiş siparişleri satıcı alt-siparişlerine böl (idempotent) ----
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    pagination: { take: 10000 } as any,
  })
  let split = 0
  for (const o of orders as any[]) {
    split += await splitOrder(container, o.id)
  }
  logger.info(
    `[setup-marketplace] ${orders.length} sipariş tarandı, ${split} yeni alt-sipariş üretildi.`
  )
}
