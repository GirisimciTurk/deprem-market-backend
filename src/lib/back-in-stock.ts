import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PUSH_MODULE } from "../modules/push"
import type PushModuleService from "../modules/push/service"
import { sendToSubscriptions } from "./web-push"

/**
 * Bir envanter kalemi 0 → pozitife geçtiğinde ("stoğa geldi"), o kaleme bağlı
 * variant'lar için "haber ver" kayıtlarını bulur, abonelere push gönderir ve
 * gönderilen kayıtları temizler.
 *
 * ASLA throw etmez — stok güncelleme akışı (sipariş/iade/manuel) bundan
 * etkilenmemeli. VAPID yoksa sendToSubscriptions sessizce atlar; yine de
 * kayıtları temizleriz (tekrar tetiklenmesin).
 */
export async function notifyBackInStock(
  container: any,
  inventoryItemId: string
): Promise<void> {
  let logger: any
  try {
    logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Envanter kalemine bağlı variant id'lerini çöz.
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: ["variants.id"],
      filters: { id: inventoryItemId },
    })
    const variantIds: string[] = (data?.[0]?.variants || [])
      .map((v: any) => v?.id)
      .filter(Boolean)
    if (!variantIds.length) return

    const push = container.resolve(PUSH_MODULE) as PushModuleService
    const alerts = await push.listStockAlerts(
      { variant_id: variantIds },
      { take: null }
    )
    if (!alerts.length) return

    // Gönderim için endpoint → abonelik (p256dh/auth) eşlemesi gerekir.
    const endpoints = [...new Set(alerts.map((a: any) => a.endpoint))]
    const subs = await push.listPushSubscriptions(
      { endpoint: endpoints },
      { take: null }
    )
    const subByEndpoint = new Map(subs.map((s: any) => [s.endpoint, s]))

    // Variant bazında grupla → her ürün için doğru isimle bildirim.
    const byVariant = new Map<string, any[]>()
    for (const a of alerts as any[]) {
      const arr = byVariant.get(a.variant_id) || []
      arr.push(a)
      byVariant.set(a.variant_id, arr)
    }

    for (const [, group] of byVariant) {
      const sample = group[0]
      const title = sample.product_title || "Beklediğiniz ürün"
      const handle = sample.product_handle
      const targetSubs = group
        .map((a: any) => subByEndpoint.get(a.endpoint))
        .filter(Boolean)
      if (!targetSubs.length) continue

      await sendToSubscriptions(container, targetSubs as any[], {
        title: "Stoğa geldi! 🎉",
        body: `“${title}” yeniden stokta. Tükenmeden sipariş verin.`,
        url: handle ? `/tr/products/${handle}` : "/tr/store",
        tag: `stock-${sample.variant_id}`,
        // Bildirim altı buton → doğrudan ürün sayfası (ana url ile aynı hedef).
        actions: [{ action: "view", title: "Ürüne git" }],
      })
    }

    // Bildirilen kayıtları sil (tek seferlik uyarı).
    await push.deleteStockAlerts((alerts as any[]).map((a) => a.id))
    logger?.info(
      `[BackInStock] ${alerts.length} stok uyarısı gönderildi/temizlendi (kalem ${inventoryItemId}).`
    )
  } catch (err: any) {
    logger?.warn?.(`[BackInStock] Bildirim hatası: ${err?.message}`)
  }
}
