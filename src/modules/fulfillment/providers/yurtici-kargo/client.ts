import { Logger } from "@medusajs/framework/types"

export interface YurticiCredentials {
  username: string
  password: string
  customerCode: string
}

export interface YurticiShipmentInput {
  /** Sipariş referansı (display_id veya order id) */
  reference: string
  /** Fulfillment id */
  fulfillmentId?: string
  /** Alıcı adı */
  recipientName?: string
  /** Alıcı adresi (tek satır) */
  recipientAddress?: string
  /** Alıcı şehri */
  recipientCity?: string
  /** Alıcı telefonu */
  recipientPhone?: string
  /** Koli adedi */
  pieces?: number
}

export interface YurticiLabel {
  tracking_number: string
  tracking_url: string
  label_url: string
}

export interface YurticiShipmentResult {
  /** Yurtiçi tarafındaki gönderi/entegrasyon kodu */
  shipmentId?: string
  labels: YurticiLabel[]
}

/**
 * Yurtiçi Kargo entegrasyon client'ı.
 *
 * ŞU AN: kimlik bilgileri (YURTICI_USERNAME / YURTICI_PASSWORD / YURTICI_CUSTOMER_CODE)
 * .env'de yoksa `fromEnv` null döner ve sistem **manuel kargo modunda** çalışır
 * (takip numarasını satıcı/admin elle girer).
 *
 * GERÇEK ENTEGRASYON: Yurtiçi'nin SOAP/REST servisi sözleşmeyle birlikte verilen
 * dokümana göre çağrılır. Kimlik bilgileri geldiğinde aşağıdaki
 * `createShipment` / `cancelShipment` metodlarının içini doldurman yeterli —
 * provider servisi otomatik olarak API moduna geçer.
 *
 * @see https://www.yurticikargo.com/  (takip)
 * @see Yurtiçi Entegrasyon dokümanı (sözleşme ile birlikte verilir)
 */
export class YurticiKargoClient {
  protected creds_: YurticiCredentials
  protected logger_?: Logger

  constructor(creds: YurticiCredentials, logger?: Logger) {
    this.creds_ = creds
    this.logger_ = logger
  }

  /**
   * .env'de tam kimlik bilgisi varsa client döner, yoksa null (manuel mod).
   */
  static fromEnv(logger?: Logger): YurticiKargoClient | null {
    const username = process.env.YURTICI_USERNAME
    const password = process.env.YURTICI_PASSWORD
    const customerCode = process.env.YURTICI_CUSTOMER_CODE

    if (!username || !password || !customerCode) {
      logger?.info(
        "[yurtici-kargo] API kimlik bilgileri tanımlı değil — manuel kargo modu aktif (takip numarası elle girilecek)."
      )
      return null
    }

    return new YurticiKargoClient({ username, password, customerCode }, logger)
  }

  /**
   * Yurtiçi'de gönderi oluşturur ve takip numarası/etiket döner.
   *
   * TODO(yurtici-entegrasyon): Yurtiçi gönderi-oluşturma çağrısını burada yap:
   *   1. Sözleşmedeki servis dokümanından client kur.
   *   2. creds + YurticiShipmentInput ile gönderi isteği gönder.
   *   3. Dönen entegrasyon/takip kodunu YurticiLabel olarak map'le.
   */
  async createShipment(_input: YurticiShipmentInput): Promise<YurticiShipmentResult> {
    throw new Error(
      "[yurtici-kargo] Yurtiçi entegrasyonu henüz implemente edilmedi. " +
        "Kimlik bilgileri tanımlıysa client.ts içindeki createShipment'i doldur."
    )
  }

  /**
   * Yurtiçi'deki gönderiyi iptal eder.
   *
   * TODO(yurtici-entegrasyon): gönderi iptal çağrısını yap.
   */
  async cancelShipment(_shipmentId: string): Promise<void> {
    throw new Error(
      "[yurtici-kargo] Yurtiçi gönderi iptali henüz implemente edilmedi."
    )
  }
}
