import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { applyStockChange, getLevel } from "../lib/stock-movement"
import { PUSH_MODULE } from "../modules/push"
import type PushModuleService from "../modules/push/service"
import { STOCK_MOVEMENT_MODULE } from "../modules/stock_movement"
import type StockMovementModuleService from "../modules/stock_movement/service"

/**
 * "Stoğa gelince haber ver" akışının uçtan uca doğrulaması.
 *
 * Senaryo: bir varyantın stoğu 0'a çekilir, o varyant için uyarı kaydı açılır,
 * sonra satıcı panelinin kullandığı yolla (applyStockChange) stok girilir.
 * Beklenen: uyarı kaydı TÜKETİLİR (silinir) ve stok hareketi deftere yazılır.
 *
 * Çalıştırma: npx medusa exec ./src/scripts/verify-back-in-stock.ts
 */
export default async function verifyBackInStock({ container }: { container: any }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const push = container.resolve(PUSH_MODULE) as PushModuleService
  const movements = container.resolve(STOCK_MOVEMENT_MODULE) as StockMovementModuleService

  const say = (m: string) => console.log(m)
  let failed = 0
  const check = (ok: boolean, label: string) => {
    say(`  ${ok ? "GEÇTİ ✓" : "KALDI ✗"}  ${label}`)
    if (!ok) failed++
  }

  // Envanter kalemi olan bir varyant bul.
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "title", "product.title", "inventory_items.inventory_item_id"],
    filters: {},
  })
  const target = (variants ?? []).find(
    (v: any) => v?.inventory_items?.[0]?.inventory_item_id
  )
  if (!target) {
    say("Envanter kalemi olan varyant bulunamadı — test atlandı.")
    return
  }
  const invItemId = target.inventory_items[0].inventory_item_id

  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  const locationId = locations?.[0]?.id
  if (!locationId) {
    say("Stok lokasyonu yok — test atlandı.")
    return
  }

  say(`Test varyantı: ${target.product?.title ?? target.title} (${target.id})`)
  const original = await getLevel(container, invItemId, locationId)
  const originalStocked = original?.stocked_quantity ?? 0
  say(`Başlangıç stoğu: ${originalStocked}`)

  try {
    // 1) Stoğu 0'a çek (ürün tükendi).
    await applyStockChange(container, {
      inventoryItemId: invItemId,
      locationId,
      newStocked: 0,
      type: "manual",
      reason: "test: tükendi",
    })
    const zero = await getLevel(container, invItemId, locationId)
    check(zero?.stocked_quantity === 0, "stok 0'a çekildi")

    // 2) Müşteri "haber ver" dedi.
    const endpoint = `https://example.test/push/verify-${target.id}`
    await push.addStockAlert({
      variant_id: target.id,
      endpoint,
      product_id: null,
      product_handle: null,
      product_title: target.product?.title ?? null,
      customer_id: null,
    })
    const before = await push.listStockAlerts({ variant_id: target.id }, { take: null })
    check(before.length > 0, `uyarı kaydı açıldı (${before.length} kayıt)`)

    // 3) Satıcı panelinin kullandığı yolla stok gir.
    const movesBefore = await movements.listStockMovements(
      { inventory_item_id: invItemId },
      { take: null }
    )
    await applyStockChange(container, {
      inventoryItemId: invItemId,
      locationId,
      newStocked: 7,
      type: "manual",
      reason: "test: satıcı stok girişi",
    })

    // 4) Beklenen sonuçlar.
    const after = await push.listStockAlerts({ variant_id: target.id }, { take: null })
    check(
      after.length === 0,
      "stok girilince uyarı kaydı tüketildi (bildirim yolu çalıştı)"
    )

    const movesAfter = await movements.listStockMovements(
      { inventory_item_id: invItemId },
      { take: null }
    )
    check(
      movesAfter.length > movesBefore.length,
      `stok hareketi deftere yazıldı (${movesBefore.length} → ${movesAfter.length})`
    )

    const level = await getLevel(container, invItemId, locationId)
    check(level?.stocked_quantity === 7, "stok 7 olarak ayarlandı")
  } finally {
    // Testin bıraktığı uyarı kaydını ve stoğu geri al.
    const leftovers = await push.listStockAlerts({ variant_id: target.id }, { take: null })
    if (leftovers.length) {
      await push.deleteStockAlerts(leftovers.map((a: any) => a.id))
    }
    await applyStockChange(container, {
      inventoryItemId: invItemId,
      locationId,
      newStocked: originalStocked,
      type: "manual",
      reason: "test: eski stoğa dönüş",
    })
    say(`Stok geri alındı: ${originalStocked}`)
  }

  say(failed === 0 ? "\nTÜM KONTROLLER GEÇTİ" : `\n${failed} KONTROL BAŞARISIZ`)
}
