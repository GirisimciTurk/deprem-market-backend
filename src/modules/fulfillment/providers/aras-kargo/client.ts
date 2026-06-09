import { Logger } from "@medusajs/framework/types"

export interface ArasCredentials {
  username: string
  password: string
  customerCode: string
}

export interface ArasShipmentInput {
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

export interface ArasLabel {
  tracking_number: string
  tracking_url: string
  label_url: string
}

export interface ArasShipmentResult {
  /** Aras tarafındaki gönderi/integrasyon kodu */
  shipmentId?: string
  labels: ArasLabel[]
}

/**
 * Aras Kargo entegrasyon client'ı.
 *
 * ŞU AN: kimlik bilgileri (ARAS_USERNAME / ARAS_PASSWORD / ARAS_CUSTOMER_CODE)
 * .env'de yoksa `fromEnv` null döner ve sistem **manuel kargo modunda** çalışır
 * (admin takip numarasını elle girer).
 *
 * GERÇEK ENTEGRASYON: Aras'ın SOAP servisi (SetOrder / GetQueryDS) sözleşmeyle
 * birlikte verilen WSDL üzerinden çağrılır. Kimlik bilgileri geldiğinde aşağıdaki
 * `createShipment` / `cancelShipment` metodlarının içini doldurman yeterli —
 * provider servisi otomatik olarak API moduna geçer.
 *
 * @see https://kargotakip.araskargo.com.tr/  (takip)
 * @see Aras Entegrasyon WSDL'i (sözleşme ile birlikte verilir)
 */
export class ArasKargoClient {
  protected creds_: ArasCredentials
  protected logger_?: Logger

  constructor(creds: ArasCredentials, logger?: Logger) {
    this.creds_ = creds
    this.logger_ = logger
  }

  /**
   * .env'de tam kimlik bilgisi varsa client döner, yoksa null (manuel mod).
   */
  static fromEnv(logger?: Logger): ArasKargoClient | null {
    const username = process.env.ARAS_USERNAME
    const password = process.env.ARAS_PASSWORD
    const customerCode = process.env.ARAS_CUSTOMER_CODE

    if (!username || !password || !customerCode) {
      logger?.info(
        "[aras-kargo] API kimlik bilgileri tanımlı değil — manuel kargo modu aktif (takip numarası admin'den girilecek)."
      )
      return null
    }

    return new ArasKargoClient({ username, password, customerCode }, logger)
  }

  /**
   * Aras'ta gönderi oluşturur ve takip numarası/etiket döner.
   *
   * TODO(aras-entegrasyon): SOAP `SetOrder` çağrısını burada yap. Örnek akış:
   *   1. WSDL'den SOAP client kur (ör. `soap` paketi).
   *   2. creds + ArasShipmentInput ile SetOrder isteği gönder.
   *   3. Dönen integrasyon/takip kodunu ArasLabel olarak map'le.
   */
  async createShipment(_input: ArasShipmentInput): Promise<ArasShipmentResult> {
    throw new Error(
      "[aras-kargo] Aras SOAP entegrasyonu henüz implemente edilmedi. " +
        "Kimlik bilgileri tanımlıysa client.ts içindeki createShipment'i doldur."
    )
  }

  /**
   * Aras'taki gönderiyi iptal eder.
   *
   * TODO(aras-entegrasyon): SOAP `CancelDispatch` / ilgili iptal çağrısını yap.
   */
  async cancelShipment(_shipmentId: string): Promise<void> {
    throw new Error(
      "[aras-kargo] Aras gönderi iptali henüz implemente edilmedi."
    )
  }
}
