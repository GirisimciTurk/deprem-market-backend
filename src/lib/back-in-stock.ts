import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PUSH_MODULE } from "../modules/push"
import type PushModuleService from "../modules/push/service"
import { sendToSubscriptions, isPushConfigured } from "./web-push"
import { errorMessage } from "./errors"
import {
  getStockAlertTtlDays,
  isStockAlertExpired,
  resolveAlertTargets,
} from "./stock-alert-policy"
import {
  backInStockPayload,
  fallbackProductName,
  groupByLocale,
} from "./push-i18n"

/**
 * Bir envanter kalemi 0 → pozitife geçtiğinde ("stoğa geldi"), o kaleme bağlı
 * variant'lar için "haber ver" kayıtlarını bulur, abonelere push gönderir ve
 * gönderilen kayıtları temizler.
 *
 * ASLA throw etmez — stok güncelleme akışı (sipariş/iade/manuel) bundan
 * etkilenmemeli.
 *
 * VAPID anahtarları tanımlı değilse kayıtlar SİLİNMEZ ve fonksiyon erkenden
 * çıkar. Önceden bu durumda da temizlik yapılıyordu: push atlanıyor ama "haber
 * ver" talepleri siliniyordu, yani anahtarlar kurulana kadar biriken tüm
 * müşteri talepleri geri dönülemez şekilde kayboluyordu.
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

    // Gönderim mümkün değilse kayıtlara DOKUNMA — ürün bir dahaki sefer stoğa
    // girdiğinde (ya da anahtarlar kurulduktan sonra) yeniden denenebilsin.
    if (!isPushConfigured()) {
      logger?.warn?.(
        `[BackInStock] VAPID anahtarları yok — ${alerts.length} stok uyarısı KORUNDU, gönderim atlandı (kalem ${inventoryItemId}).`
      )
      return
    }

    // Gönderim için endpoint → abonelik (p256dh/auth) eşlemesi gerekir.
    const endpoints = [...new Set(alerts.map((a: any) => a.endpoint))]
    const subs = await push.listPushSubscriptions(
      { endpoint: endpoints },
      { take: null }
    )
    const subByEndpoint = new Map(subs.map((s: any) => [s.endpoint, s]))

    // Uyarı HESABA bağlıysa müşterinin O ANKİ TÜM cihazlarına gönderilir:
    // kullanıcı uyarıyı telefonda kurup masaüstünde kaçırmasın (kayıt cihaza
    // değil hesaba ait). Misafir döneminden kalan customer_id'siz kayıtlar
    // yalnız kendi endpoint'ine gider.
    const customerIds = [
      ...new Set(alerts.map((a: any) => a.customer_id).filter(Boolean)),
    ] as string[]
    const subsByCustomer = new Map<string, any[]>()
    if (customerIds.length) {
      const customerSubs = await push.listPushSubscriptions(
        { customer_id: customerIds },
        { take: null }
      )
      for (const s of customerSubs as any[]) {
        const arr = subsByCustomer.get(s.customer_id) || []
        arr.push(s)
        subsByCustomer.set(s.customer_id, arr)
      }
    }

    const targetsFor = (a: any): any[] =>
      resolveAlertTargets(a, { subsByCustomer, subByEndpoint }) as any[]

    // Variant bazında grupla → her ürün için doğru isimle bildirim.
    const byVariant = new Map<string, any[]>()
    for (const a of alerts as any[]) {
      const arr = byVariant.get(a.variant_id) || []
      arr.push(a)
      byVariant.set(a.variant_id, arr)
    }

    // Yalnız GERÇEKTEN teslim edilen uyarılar silinir. Önceden aboneliği
    // bulunamayan kayıtlar da toplu silinip sessizce kayboluyordu.
    const deliveredIds: string[] = []
    const undelivered: any[] = []

    for (const [, group] of byVariant) {
      const sample = group[0]
      const handle = sample.product_handle

      const targetSubs: any[] = []
      const covered: any[] = []
      // Her uyarının HANGİ endpoint'lere hedeflendiği — silme kararı grup
      // geneline değil kayıt bazına dayanmalı.
      const endpointsByAlert = new Map<string, string[]>()
      const seenEndpoints = new Set<string>()
      for (const a of group) {
        const subsForAlert = targetsFor(a)
        if (!subsForAlert.length) {
          undelivered.push(a)
          continue
        }
        covered.push(a)
        endpointsByAlert.set(
          a.id,
          subsForAlert.map((s: any) => s.endpoint)
        )
        for (const s of subsForAlert) {
          // Aynı cihaza aynı ürün için iki kez gönderme (iki kayıt aynı
          // müşteriye/endpoint'e denk gelebilir).
          if (seenEndpoints.has(s.endpoint)) continue
          seenEndpoints.add(s.endpoint)
          targetSubs.push(s)
        }
      }
      if (!targetSubs.length) continue

      // Cihazın diline göre ayrı gönder: bildirim METNİ abonelikteki locale'den
      // kurulur (eskiden herkese sabit Türkçe gidiyordu). Hedef YOL dile göre
      // değişmez — yol öneki ülke kodudur (bkz. push-i18n.productUrl).
      const byLocale = groupByLocale(targetSubs)

      const okEndpoints = new Set<string>()
      for (const [loc, subsForLocale] of byLocale) {
        const res = await sendToSubscriptions(
          container,
          subsForLocale,
          backInStockPayload(loc, {
            productTitle: sample.product_title || fallbackProductName(loc),
            productHandle: handle,
            variantId: sample.variant_id,
          })
        )
        for (const e of res.okEndpoints) okEndpoints.add(e)
      }

      for (const a of covered) {
        const targets = endpointsByAlert.get(a.id) ?? []
        // Kaydın KENDİ hedeflerinden en az birine ulaşıldıysa teslim sayılır.
        // Grup geneli "sent > 0" ölçütü, aynı varyantı bekleyen ULAŞILAMAYAN
        // müşterilerin kaydını da silip taleplerini yok ediyordu.
        if (targets.some((e) => okEndpoints.has(e))) {
          deliveredIds.push(a.id)
        } else {
          undelivered.push(a)
        }
      }
    }

    // Teslim edilemeyen kayıtlar KORUNUR (bir dahaki stok girişinde yeniden
    // denenir) ama sonsuza kadar değil: cihazını kaybetmiş/vazgeçmiş kullanıcının
    // kaydı tabloda süresiz birikirse her stok hareketinde boşuna işlenir.
    // TTL dolanlar burada temizlenir — silme yalnız ARTIK ANLAMSIZ kayıtlara.
    const ttlDays = getStockAlertTtlDays()
    const now = Date.now()
    const expiredIds = undelivered
      .filter((a) => isStockAlertExpired(a.created_at, now, ttlDays))
      .map((a) => a.id)

    const removableIds = [...deliveredIds, ...expiredIds]
    if (removableIds.length) {
      await push.deleteStockAlerts(removableIds)
    }
    const keptCount = undelivered.length - expiredIds.length
    logger?.info(
      `[BackInStock] ${deliveredIds.length} stok uyarısı gönderildi/temizlendi` +
        (keptCount ? `, ${keptCount} kayıt korundu` : "") +
        (expiredIds.length
          ? `, ${expiredIds.length} kayıt ${ttlDays} günü aştığı için düşürüldü`
          : "") +
        ` (kalem ${inventoryItemId}).`
    )
  } catch (err) {
    logger?.warn?.(`[BackInStock] Bildirim hatası: ${errorMessage(err)}`)
  }
}
