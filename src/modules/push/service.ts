import { MedusaService } from "@medusajs/framework/utils"
import PushSubscription from "./models/push-subscription"
import StockAlert from "./models/stock-alert"

/**
 * Web push abonelikleri ve "stoğa gelince haber ver" kayıtlarını yöneten modül
 * servisi. MedusaService temel CRUD'u (list/create/update/delete...) otomatik
 * üretir; aşağıdaki yardımcılar endpoint bazlı upsert/dedup mantığını tek yerde
 * toplar.
 */
class PushModuleService extends MedusaService({
  PushSubscription,
  StockAlert,
}) {
  /**
   * Aynı endpoint varsa günceller, yoksa oluşturur.
   *
   * Hesap bağı ASLA aşağı çekilmez: misafir bağlamından gelen bir çağrı
   * (customer_id yok) daha önce bir hesaba bağlanmış aboneliği koparıyordu —
   * ör. oturum süresi dolmuş bir sekmede bildirim akışı tetiklenince cihaz
   * hesaptan düşüyor ve sipariş bildirimleri sessizce kesiliyordu. Yeni bir
   * customer_id geldiğinde (giriş/hesap değişimi) bağ güncellenir.
   */
  async upsertSubscription(data: {
    endpoint: string
    p256dh: string
    auth: string
    customer_id?: string | null
    user_agent?: string | null
    locale?: string | null
  }) {
    const [existing] = await this.listPushSubscriptions({
      endpoint: data.endpoint,
    })
    if (existing) {
      // Hesap bağı ve dil AŞAĞI ÇEKİLMEZ: çağrı bunları taşımıyorsa mevcut
      // değer korunur (yeni değer geldiğinde güncellenir).
      const customer_id = data.customer_id ?? existing.customer_id ?? null
      const locale = data.locale ?? existing.locale ?? null
      return await this.updatePushSubscriptions({
        id: existing.id,
        ...data,
        customer_id,
        locale,
      })
    }
    return await this.createPushSubscriptions(data)
  }

  /**
   * Aboneliğin hesap bağını çözer (kayıt SİLİNMEZ, customer_id null olur).
   * Yalnız bağ gerçekten verilen müşteriye aitse çözülür — başkasının cihazını
   * çözmek mümkün olmamalı. Bağ çözüldüyse true döner.
   *
   * Çıkışta çağrılır: `upsertSubscription` hesap bağını bilerek aşağı çekmiyor
   * (oturum düşmesi cihazı hesaptan koparmasın diye), bu yüzden AÇIK çıkışta
   * bağın burada çözülmesi gerekir.
   */
  async unbindSubscriptionFromCustomer(
    endpoint: string,
    customerId: string
  ): Promise<boolean> {
    if (!endpoint || !customerId) return false
    const [existing] = await this.listPushSubscriptions({ endpoint })
    if (!existing || existing.customer_id !== customerId) return false
    await this.updatePushSubscriptions({ id: existing.id, customer_id: null })
    return true
  }

  /** Endpoint'e ait aboneliği (varsa) siler. Silinen kayıt sayısını döner. */
  async deleteSubscriptionByEndpoint(endpoint: string): Promise<number> {
    const subs = await this.listPushSubscriptions({ endpoint })
    if (subs.length) {
      await this.deletePushSubscriptions(subs.map((s) => s.id))
    }
    return subs.length
  }

  /**
   * (variant_id, endpoint) için tek kayıt — varsa günceller, yoksa oluşturur.
   *
   * Var olan kaydın hesap bağı TAZELENİR: aynı cihazda misafirken (veya başka
   * bir hesapla) açılmış bir kayıt duruyorsa, uyarıyı şimdi kuran giriş yapmış
   * kullanıcıya bağlanmalı. Eskiden mevcut kayıt olduğu gibi döndürülüyordu →
   * kayıt `customer_id = null` kalıyor, "hesaba bağlı uyarı" vaadi tutulmuyor ve
   * kullanıcının diğer cihazlarına bildirim gitmiyordu.
   */
  async addStockAlert(data: {
    variant_id: string
    endpoint: string
    product_id?: string | null
    product_handle?: string | null
    product_title?: string | null
    customer_id?: string | null
  }) {
    const [existing] = await this.listStockAlerts({
      variant_id: data.variant_id,
      endpoint: data.endpoint,
    })
    if (existing) {
      if (data.customer_id && existing.customer_id !== data.customer_id) {
        return await this.updateStockAlerts({
          id: existing.id,
          customer_id: data.customer_id,
        })
      }
      return existing
    }
    return await this.createStockAlerts(data)
  }
}

export default PushModuleService
