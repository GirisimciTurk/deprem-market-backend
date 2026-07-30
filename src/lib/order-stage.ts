/**
 * Müşteriye görünen 4 aşamalı sipariş takip çizelgesinin TEK türetme kaynağı.
 *
 * Aşama, alt-siparişin (seller_order) iki ekseninden hesaplanır:
 *   - para ekseni: fulfillment_status (pending | fulfilled | canceled) — hakediş
 *     buna bağlı, bu yüzden dokunulmadı (bkz. models/seller-order.ts:60 yorumu).
 *   - aşama ekseni: preparing_at zaman damgası.
 *
 * NEDEN BU DOSYA VAR: aşamayı hesaplayan mantık daha önce storefront'ta
 * (tracking-utils.ts) ÇEKİRDEK Medusa order.fulfillment_status'undan türetiliyordu.
 * Ama bu kod tabanında çekirdek fulfillment hiç yaratılmıyor (createOrderFulfillmentWorkflow
 * yalnız src/scripts/test-seller-returns.ts'te), yani çekirdek alan kalıcı olarak
 * "not_fulfilled" kalıyor ve müşteri satıcı ne yaparsa yapsın hep 2. adımı görüyordu.
 * Artık tek kaynak burası; storefront, admin ve satıcı paneli bunun ürettiği
 * `stage` alanını okur.
 *
 * "Teslim Edildi" (4. aşama) BİLEREK türetilmiyor: kargo firmalarıyla API/webhook
 * entegrasyonu yok (lib/cargo.ts yalnız takip LİNKİ şablonu üretir), o yüzden
 * teslim bilgisinin güvenilir kaynağı da yok. Aşama listesinde yerini koruyor ama
 * hiçbir alt-sipariş oraya ulaşmaz — bugünkü davranışın aynısı.
 */

export type OrderStage = "received" | "preparing" | "shipped" | "canceled"

/** Çizelgedeki sıra. `canceled` sıra dışıdır (dallanma), bu yüzden listede yok. */
export const STAGE_ORDER: readonly OrderStage[] = [
  "received",
  "preparing",
  "shipped",
] as const

export const STAGE_LABELS: Record<OrderStage, string> = {
  received: "Sipariş Alındı",
  preparing: "Hazırlanıyor",
  shipped: "Kargoya Verildi",
  canceled: "İptal Edildi",
}

/** Aşama türetmek için gereken minimum alt-sipariş şekli. */
export type StageSource = {
  fulfillment_status?: string | null
  preparing_at?: Date | string | null
}

export function sellerOrderStage(so: StageSource): OrderStage {
  if (so.fulfillment_status === "canceled") return "canceled"
  if (so.fulfillment_status === "fulfilled") return "shipped"
  if (so.preparing_at) return "preparing"
  return "received"
}

export function stageLabel(stage: OrderStage): string {
  return STAGE_LABELS[stage]
}

/**
 * Çok satıcılı bir siparişin TEK bir aşamayla özetlenmesi: iptal olmayan
 * alt-siparişlerin EN GERİDE olanı.
 *
 * Neden en geride: 2 satıcıdan 1'i kargoladıysa müşterinin siparişi bir bütün
 * olarak "Kargoya Verildi" değildir — henüz gelmeyen paketi yolda sanmasın.
 * Paket bazlı kırılım ayrıca listelenir (storefront SellerShipments).
 *
 * Tüm alt-siparişler iptalse sonuç "canceled". Hiç alt-sipariş yoksa null döner
 * ve çağıran eski davranışına düşebilir (geriye dönük uyum).
 */
export function aggregateStage(sources: StageSource[]): OrderStage | null {
  if (!sources.length) return null

  const active = sources.filter((s) => s.fulfillment_status !== "canceled")
  if (!active.length) return "canceled"

  let lowest = STAGE_ORDER.length - 1
  for (const s of active) {
    const idx = STAGE_ORDER.indexOf(sellerOrderStage(s))
    if (idx >= 0 && idx < lowest) lowest = idx
  }
  return STAGE_ORDER[lowest]
}
