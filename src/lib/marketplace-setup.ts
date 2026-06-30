import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { splitOrder } from "./split-order"
import { generateInvoicesForOrder } from "./einvoice/generate"

const HOUSE_HANDLE = "deprem-market"

export type MarketplaceSetupResult = {
  house_seller_id: string
  house_created: boolean
  products_linked: number
  orders_scanned: number
  seller_orders_created: number
  invoices_created: number
}

/**
 * Pazar yeri başlangıç kurulumu (idempotent):
 *  1. Birinci-parti "depremTek Market" satıcısını (is_house, komisyon %0, aktif) oluşturur.
 *  2. Satıcısı olmayan tüm mevcut ürünleri bu house satıcıya bağlar.
 *  3. Geçmiş siparişleri satıcı alt-siparişlerine (seller_order) böler.
 *
 * Hem `npm run setup:marketplace` (lokal) hem de POST /admin/marketplace-setup
 * (prod) bunu çağırır.
 */
export async function runMarketplaceSetup(container: any): Promise<MarketplaceSetupResult> {
  const logger = container.resolve("logger")
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)

  // --- 1. House satıcı (idempotent) --------------------------------------
  const [existing] = await marketplace.listSellers({ handle: HOUSE_HANDLE }, { take: 1 })
  let house = existing
  let house_created = false
  if (!house) {
    house = await marketplace.createSellers({
      handle: HOUSE_HANDLE,
      name: "depremTek Market",
      legal_name: "depremTek Market",
      status: "active",
      commission_rate: 0,
      is_house: true,
    })
    house_created = true
    logger.info(`[marketplace-setup] House satıcı oluşturuldu: ${house.id}`)
  } else {
    logger.info(`[marketplace-setup] House satıcı zaten var: ${house.id}`)
  }

  // --- 2. Satıcısı olmayan ürünleri house'a bağla ------------------------
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

  if (toLink.length > 0) {
    await link.create(
      toLink.map((product_id: string) => ({
        [MARKETPLACE_MODULE]: { seller_id: house.id },
        [Modules.PRODUCT]: { product_id },
      }))
    )
    logger.info(`[marketplace-setup] ${toLink.length} ürün '${house.name}' satıcısına bağlandı.`)
  } else {
    logger.info("[marketplace-setup] Bağlanacak ürün yok.")
  }

  // --- 3. Geçmiş siparişleri böl (idempotent) ----------------------------
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    pagination: { take: 10000 } as any,
  })
  let split = 0
  let invoices = 0
  for (const o of orders as any[]) {
    split += await splitOrder(container, o.id)
    invoices += await generateInvoicesForOrder(container, o.id)
  }
  logger.info(
    `[marketplace-setup] ${orders.length} sipariş tarandı, ${split} yeni alt-sipariş, ${invoices} taslak fatura.`
  )

  return {
    house_seller_id: house.id,
    house_created,
    products_linked: toLink.length,
    orders_scanned: orders.length,
    seller_orders_created: split,
    invoices_created: invoices,
  }
}
