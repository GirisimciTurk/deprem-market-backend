import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createInventoryLevelsWorkflow,
  createOrderWorkflow,
  createReservationsWorkflow,
  createOrderFulfillmentWorkflow,
  markFulfillmentAsDeliveredWorkflow,
  createAndCompleteReturnOrderWorkflow,
} from "@medusajs/core-flows"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import { splitOrder } from "../lib/split-order"
import {
  groupRequestedItemsBySeller,
  routeReturnRequested,
} from "../lib/process-return"
import {
  acceptSellerReturn,
  rejectSellerReturn,
} from "../lib/seller-return-actions"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (...a: any[]) => console.log("[TEST]", ...a)

export default async function testSellerReturns({ container }: { container: any }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const marketplace: any = container.resolve(MARKETPLACE_MODULE)

  // --- 0. Çevre: satıcılar, region(try), sales channel, lokasyon, shipping option ---
  const sellers = await marketplace.listSellers({}, { take: 20 })
  const house = sellers.find((s: any) => s.is_house)
  const seller2 = sellers.find((s: any) => !s.is_house && s.status === "active")
  if (!house || !seller2) throw new Error("house + 2. satıcı gerekli")

  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code"] })
  const region = regions.find((r: any) => r.currency_code === "try") || regions[0]
  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id"] })
  const scId = channels[0].id
  const locId = locations[0].id
  const profileId = profiles[0].id

  // return shipping option (is_return=true) var mı?
  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "rules.attribute", "rules.value"],
  })
  const hasReturnOption = shippingOptions.some((o: any) =>
    (o.rules || []).some((r: any) => r.attribute === "is_return" && String(r.value) === "true")
  )
  log("env ok. house=", house.name, "seller2=", seller2.name, "region=", region.id, "returnOption=", hasReturnOption)

  // --- 1. İki ürün (her satıcıya bir tane) + stok ---
  const stamp = Date.now().toString(36).toLowerCase().replace(/[^a-z0-9]/g, "")
  async function makeProduct(title: string, sellerId: string, suffix: string) {
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title,
            handle: `test-ret-${suffix}-${stamp}`,
            status: "published" as any,
            shipping_profile_id: profileId,
            options: [{ title: "Model", values: ["Standart"] }],
            variants: [
              {
                title: "Standart",
                sku: `TR-${suffix}-${stamp}`,
                options: { Model: "Standart" },
                manage_inventory: true,
                prices: [{ amount: 100000, currency_code: "try" }],
              },
            ],
            sales_channels: [{ id: scId }],
          },
        ],
      },
    })
    const product = (result as any[])[0]
    await link.create({
      [MARKETPLACE_MODULE]: { seller_id: sellerId },
      [Modules.PRODUCT]: { product_id: product.id },
    })
    const { data: full } = await query.graph({
      entity: "product",
      fields: ["id", "variants.id", "variants.inventory_items.inventory_item_id"],
      filters: { id: product.id },
    })
    const variant = (full[0] as any).variants[0]
    const invItemId = variant.inventory_items?.[0]?.inventory_item_id
    if (invItemId) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: [{ inventory_item_id: invItemId, location_id: locId, stocked_quantity: 50 }] },
      })
    }
    return { product, variantId: variant.id, invItemId }
  }

  const pHouse = await makeProduct("TEST İade House Ürün", house.id, "h")
  const pS2 = await makeProduct("TEST İade Satıcı2 Ürün", seller2.id, "s2")
  log("ürünler:", pHouse.product.id, pS2.product.id)

  // --- 2. Sipariş (2 kalem) ---
  const { result: order }: any = await createOrderWorkflow(container).run({
    input: {
      region_id: region.id,
      sales_channel_id: scId,
      currency_code: "try",
      email: "iade-test@example.com",
      status: "completed" as any,
      shipping_address: {
        first_name: "Test", last_name: "Müşteri", address_1: "Test Mah", city: "İstanbul",
        postal_code: "34000", country_code: "tr", phone: "5551112233",
      },
      items: [
        { title: "TEST İade House Ürün", variant_id: pHouse.variantId, quantity: 1, unit_price: 100000, product_id: pHouse.product.id } as any,
        { title: "TEST İade Satıcı2 Ürün", variant_id: pS2.variantId, quantity: 1, unit_price: 100000, product_id: pS2.product.id } as any,
      ],
      transactions: [{ amount: 200000, currency_code: "try" } as any],
    } as any,
  })
  log("order:", order.id, "display_id:", order.display_id, "items:", order.items?.length)

  // --- 2b. Stok rezervasyonu (cart normalde yapar; doğrudan order'da elle) ---
  const itemInv: Record<string, string> = {
    [(order.items as any[])[0].id]: pHouse.invItemId,
    [(order.items as any[])[1].id]: pS2.invItemId,
  }
  await createReservationsWorkflow(container).run({
    input: {
      reservations: (order.items as any[]).map((i) => ({
        inventory_item_id: itemInv[i.id],
        location_id: locId,
        quantity: 1,
        line_item_id: i.id,
      })),
    } as any,
  })

  // --- 2c. Fulfill + deliver (iade ancak teslim edilmiş kalemler için açılır) ---
  await createOrderFulfillmentWorkflow(container).run({
    input: {
      order_id: order.id,
      items: (order.items as any[]).map((i) => ({ id: i.id, quantity: 1 })),
    } as any,
  })
  const { data: ffOrders } = await query.graph({
    entity: "order",
    fields: ["id", "fulfillments.id", "fulfillments.delivered_at"],
    filters: { id: order.id },
  })
  const fulfillments = (ffOrders[0] as any).fulfillments || []
  for (const ff of fulfillments) {
    await markFulfillmentAsDeliveredWorkflow(container).run({ input: { id: ff.id } as any })
  }
  log("fulfilled + delivered:", fulfillments.length, "fulfillment")

  // --- 3. Sipariş bölme → 2 seller_order ---
  const n = await splitOrder(container, order.id)
  log("splitOrder → seller_order sayısı:", n)
  const sellerOrders = await marketplace.listSellerOrders({ order_id: order.id }, { take: 10 })
  log("seller_orders:", sellerOrders.map((so: any) => ({ id: so.id, seller: so.seller_id === house.id ? "house" : "s2", subtotal: so.subtotal })))

  // --- 4. İade talebini SATICIYA göre böl (store endpoint mantığı) ---
  const requested = (order.items as any[]).map((i) => ({ id: i.id, quantity: 1 }))
  const groups = await groupRequestedItemsBySeller(container, order.id, requested)
  log("groupRequestedItemsBySeller →", groups.length, "grup:", groups.map((g) => ({ seller: g.seller_id === house.id ? "house" : g.seller_id === seller2.id ? "s2" : g.seller_id, items: g.items.length })))
  if (groups.length !== 2) throw new Error(`BEKLENEN 2 grup, GELEN ${groups.length}`)

  // her grup için ayrı native return
  const returnOpt = shippingOptions.find((o: any) =>
    (o.rules || []).some((r: any) => r.attribute === "is_return" && String(r.value) === "true")
  )
  const createdReturns: any[] = []
  for (const g of groups) {
    const { result }: any = await createAndCompleteReturnOrderWorkflow(container).run({
      input: {
        order_id: order.id,
        items: g.items.map((i) => ({ id: i.id, quantity: i.quantity })),
        return_shipping: returnOpt ? { option_id: returnOpt.id } : undefined,
        location_id: locId,
      } as any,
    })
    if (locId && result?.id) {
      try { await container.resolve(Modules.ORDER).updateReturns(result.id, { location_id: locId }) } catch {}
    }
    createdReturns.push(result)
  }
  log("oluşan native return sayısı:", createdReturns.length, createdReturns.map((r) => r.id))
  if (createdReturns.length !== 2) throw new Error("BEKLENEN 2 native return")

  // seller_return oluştur (prod'da order.return_requested subscriber → routeReturnRequested;
  // exec ortamında event tetiklenmediği için doğrudan çağrılıyor, mantık aynı).
  for (const r of createdReturns) await routeReturnRequested(container, r.id)
  let srs = await marketplace.listSellerReturns({ order_id: order.id }, { take: 10 })
  log("seller_returns (split sonrası):", srs.map((r: any) => ({ seller: r.seller_id === house.id ? "house" : "s2", status: r.status, sub: r.returned_subtotal })))
  if (srs.length !== 2) throw new Error(`BEKLENEN 2 seller_return, GELEN ${srs.length}`)

  // --- 5. S1 (house) TESLİM AL & ONAYLA → received + clawback + refund ---
  const srHouse = srs.find((r: any) => r.seller_id === house.id)
  const srS2 = srs.find((r: any) => r.seller_id === seller2.id)
  const acc = await acceptSellerReturn(container, srHouse)
  log("acceptSellerReturn(house) → refunded:", acc.refunded)
  await sleep(300)

  srs = await marketplace.listSellerReturns({ order_id: order.id }, { take: 10 })
  const srHouseAfter = srs.find((r: any) => r.id === srHouse.id)
  const srS2After = srs.find((r: any) => r.id === srS2.id)
  log("house seller_return:", srHouseAfter.status, "| S2 seller_return:", srS2After.status, "(KİLİTLENME YOKSA hâlâ requested)")
  if (srHouseAfter.status !== "received") throw new Error("house received olmalı")
  if (srS2After.status !== "requested") throw new Error("KİLİTLENME! S2 etkilendi: " + srS2After.status)

  // native return durumları
  const { data: rstat } = await query.graph({ entity: "return", fields: ["id", "status", "items.received_quantity"], filters: { id: createdReturns.map((r) => r.id) } as any })
  log("native returns:", rstat.map((r: any) => ({ id: r.id.slice(-6), status: r.status, recv: (r.items || []).map((i: any) => i.received_quantity) })))

  // house seller_order clawback
  const soHouse = (await marketplace.listSellerOrders({ order_id: order.id }, { take: 10 })).find((s: any) => s.seller_id === house.id)
  log("house seller_order returned_*:", { sub: soHouse.returned_subtotal, comm: soHouse.returned_commission, earn: soHouse.returned_earning })
  if (Number(soHouse.returned_subtotal) <= 0) throw new Error("house clawback olmadı")

  // --- 6. S2 REDDET ---
  await rejectSellerReturn(container, srS2, "Ürün kullanılmış/hasarlı geldi (test)")
  await sleep(800)
  const srS2Rejected = (await marketplace.listSellerReturns({ id: srS2.id }, { take: 1 }))[0]
  log("S2 reject sonrası:", srS2Rejected.status, "| sebep:", srS2Rejected.reject_reason)
  if (srS2Rejected.status !== "rejected") throw new Error("S2 rejected olmalı")

  // --- 7. HAKEM: S2'yi satıcı adına KABUL ET (rejected → received) ---
  const acc2 = await acceptSellerReturn(container, srS2Rejected)
  log("arbitrate accept(S2) → refunded:", acc2.refunded)
  await sleep(300)
  const srS2Final = (await marketplace.listSellerReturns({ id: srS2.id }, { take: 1 }))[0]
  const soS2 = (await marketplace.listSellerOrders({ order_id: order.id }, { take: 10 })).find((s: any) => s.seller_id === seller2.id)
  log("S2 final:", srS2Final.status, "| S2 seller_order returned_sub:", soS2?.returned_subtotal)
  if (srS2Final.status !== "received") throw new Error("S2 hakem sonrası received olmalı")

  log("✅✅✅ TÜM ADIMLAR GEÇTİ — split + kilitlenme-yok + clawback + reject + hakem")
  log("order:", order.display_id)
}
