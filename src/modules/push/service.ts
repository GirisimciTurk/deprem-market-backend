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
  /** Aynı endpoint varsa günceller, yoksa oluşturur. */
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
      return await this.updatePushSubscriptions({ id: existing.id, ...data })
    }
    return await this.createPushSubscriptions(data)
  }

  /** Endpoint'e ait aboneliği (varsa) siler. Silinen kayıt sayısını döner. */
  async deleteSubscriptionByEndpoint(endpoint: string): Promise<number> {
    const subs = await this.listPushSubscriptions({ endpoint })
    if (subs.length) {
      await this.deletePushSubscriptions(subs.map((s) => s.id))
    }
    return subs.length
  }

  /** (variant_id, endpoint) için tek kayıt — varsa onu döner, yoksa oluşturur. */
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
      return existing
    }
    return await this.createStockAlerts(data)
  }
}

export default PushModuleService
