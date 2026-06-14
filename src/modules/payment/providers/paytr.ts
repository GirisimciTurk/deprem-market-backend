import { AbstractPaymentProvider } from "@medusajs/framework/utils"
import {
  CapturePaymentInput,
  CapturePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/types"
import { getPayTRConfig } from "../../../lib/paytr-config"
import { buildRefundHash } from "../../../lib/paytr-hash"

/**
 * PayTR (Pazaryeri) ödeme sağlayıcısı.
 *
 * Akış: müşteri ödemeyi PayTR iframe'inde yapar. iframe token'ı `/store/paytr/token`
 * route'unda (sepet erişimi orada) üretilir. PayTR ödeme sonucunu sunucu-sunucu
 * `/paytr-callback`'e bildirir → orada imza doğrulanıp ödeme oturumu AUTHORIZED
 * yapılır ve sepet siparişe dönüştürülür. Bu provider; oturum durumunu, capture'ı
 * ve iade'yi (/odeme/iade) yönetir. Komisyon/escrow/satıcıya transfer ayrı katmanda
 * (lib/paytr-transfer + payout) yürür.
 */
class PayTRProviderService extends AbstractPaymentProvider {
  static identifier = "paytr"
  protected logger_: any

  constructor(container: any, options: any) {
    super(container, options)
    try {
      this.logger_ = container.logger || container.resolve("logger")
    } catch (e) {
      this.logger_ = console
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    // Asıl iframe token'ı /store/paytr/token'da (sepet bilgisiyle) üretilir.
    // Burada yalnız bekleyen oturum verisi döndürülür.
    const ref = (input.data?.session_id as string) || "session_pending"
    this.logger_.info(`PayTR Provider: Ödeme oturumu başlatıldı (ref: ${ref}).`)
    return {
      id: ref,
      data: {
        status: "pending",
        provider: "paytr",
      },
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    // Durum callback tarafından data.status="success" yapılır.
    const ok =
      input.data?.status === "success" || input.data?.status === "authorized"
    return {
      status: ok ? "authorized" : "pending",
      data: input.data,
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    return {
      data: {
        ...input.data,
        captured_at: new Date().toISOString(),
        status: "captured",
      },
    }
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    if (!input.data) {
      throw new Error("PayTR iade: ödeme verisi yok.")
    }
    const merchantOid = (input.data.merchant_oid as string) || ""
    if (!merchantOid) {
      throw new Error("PayTR iade: merchant_oid eksik (ödeme verisinde).")
    }

    const cfg = getPayTRConfig()
    if (!cfg.configured) {
      throw new Error("PayTR iade: yapılandırma eksik.")
    }

    // İade tutarı PayTR'da TL (2 ondalık) beklenir; bizdeki tutar kuruş.
    const returnAmount = (Number(input.amount) / 100).toFixed(2)

    const token = buildRefundHash({
      merchantId: cfg.merchantId,
      merchantOid,
      returnAmount,
      merchantKey: cfg.merchantKey,
      merchantSalt: cfg.merchantSalt,
    })

    const form = new URLSearchParams()
    form.append("merchant_id", cfg.merchantId)
    form.append("merchant_oid", merchantOid)
    form.append("return_amount", returnAmount)
    form.append("paytr_token", token)

    const res = await fetch(`${cfg.baseUrl}/odeme/iade`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const text = await res.text()
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`PayTR iade yanıtı JSON değil: ${text.slice(0, 200)}`)
    }
    if (json.status !== "success") {
      throw new Error(`PayTR iade reddedildi: ${json.err_msg || json.reason || "Bilinmeyen hata"}`)
    }

    return {
      data: {
        ...input.data,
        refunded_amount: Number(input.amount),
        status: "refunded",
        refund_response: json,
      },
    }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    // PayTR'da ayrı "void" yok; yakalanmamış ödeme zaten tahsil edilmez.
    return { data: { ...input.data, status: "canceled" } }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const status = (input.data?.status as any) || "pending"
    return { status }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    return { data: input.data }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return {
      action: "captured",
      data: {
        session_id: payload.data.payment_session_id as string,
        amount: payload.data.amount as any,
      },
    }
  }
}

export const services = [PayTRProviderService]

export default {
  services: [PayTRProviderService],
}
