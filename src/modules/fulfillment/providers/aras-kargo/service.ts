import {
  AbstractFulfillmentProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
} from "@medusajs/framework/types"
import { ArasKargoClient } from "./client"

type InjectedDependencies = {
  logger: Logger
}

type Options = Record<string, unknown>

/**
 * Aras Kargo fulfillment provider'ı.
 *
 * provider_id (DB'de): `aras_kargo`  →  identifier ("aras") + config id ("kargo").
 *
 * İki modda çalışır:
 *  - **Manuel mod** (varsayılan): API kimlik bilgisi yoksa fulfillment oluşturulur,
 *    takip numarası daha sonra admin panelden gönderi (shipment) anında girilir.
 *  - **API modu**: ARAS_* env değişkenleri tanımlıysa createFulfillment Aras'ta
 *    gönderi açıp takip numarası/etiketi otomatik döner (client.ts doldurulunca).
 */
class ArasKargoFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "aras"

  protected logger_: Logger
  protected options_: Options
  protected client_: ArasKargoClient | null

  constructor({ logger }: InjectedDependencies, options: Options) {
    super()
    this.logger_ = logger
    this.options_ = options || {}
    this.client_ = ArasKargoClient.fromEnv(logger)
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "aras-standard",
        name: "Aras Kargo - Standart",
        code: "standard",
      },
      {
        id: "aras-express",
        name: "Aras Kargo - Hızlı",
        code: "express",
      },
      {
        id: "aras-standard-return",
        name: "Aras Kargo - İade",
        is_return: true,
      },
    ]
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: Record<string, unknown>
  ): Promise<any> {
    return { ...data }
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  // Şimdilik sabit (flat) fiyat kullanıyoruz — hesaplanan fiyat desteklenmiyor.
  async canCalculate(): Promise<boolean> {
    return false
  }

  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    _context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Aras Kargo şu an sabit fiyat (flat) kullanıyor; hesaplanan fiyat desteklenmiyor."
    )
  }

  async createFulfillment(
    _data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    // API modu: kimlik bilgisi varsa Aras'ta gönderi aç, takip no/etiketi al.
    if (this.client_) {
      try {
        const shippingAddress = (order as any)?.shipping_address
        const result = await this.client_.createShipment({
          reference: String(
            (order as any)?.display_id ?? order?.id ?? fulfillment?.id ?? ""
          ),
          fulfillmentId: fulfillment?.id,
          recipientName: shippingAddress
            ? `${shippingAddress.first_name ?? ""} ${
                shippingAddress.last_name ?? ""
              }`.trim()
            : undefined,
          recipientAddress: shippingAddress?.address_1,
          recipientCity: shippingAddress?.city,
          recipientPhone: shippingAddress?.phone,
          pieces: items?.length || 1,
        })

        return {
          data: { carrier: "aras", shipment_id: result.shipmentId },
          labels: result.labels,
        }
      } catch (e: any) {
        // API başarısız → manuel moda düş, akışı bloklama.
        this.logger_.warn(
          `[aras-kargo] Otomatik gönderi oluşturulamadı, manuel moda düşülüyor: ${e?.message}`
        )
      }
    }

    // Manuel mod: takip numarası gönderi anında admin'den gelecek.
    return {
      data: { carrier: "aras" },
      labels: [],
    }
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<any> {
    const shipmentId = (data as any)?.shipment_id
    if (this.client_ && shipmentId) {
      try {
        await this.client_.cancelShipment(String(shipmentId))
      } catch (e: any) {
        this.logger_.warn(
          `[aras-kargo] Aras gönderi iptali başarısız: ${e?.message}`
        )
      }
    }
    return {}
  }

  async createReturnFulfillment(
    _fulfillment: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    return {
      data: { carrier: "aras", is_return: true },
      labels: [],
    }
  }

  async getFulfillmentDocuments(): Promise<never[]> {
    return []
  }

  async getReturnDocuments(): Promise<never[]> {
    return []
  }

  async getShipmentDocuments(): Promise<never[]> {
    return []
  }

  async retrieveDocuments(): Promise<void> {
    return
  }
}

export default ArasKargoFulfillmentProviderService
