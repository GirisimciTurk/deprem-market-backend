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
import { createHash } from "crypto"
import { getPaynkolayConfig } from "../../../lib/paynkolay-config"

function calculateHash(
  sx: string,
  clientRefCode: string,
  amount: string,
  successUrl: string,
  failUrl: string,
  rnd: string,
  customerKey: string,
  merchantSecretKey: string
): string {
  const raw = `${sx}|${clientRefCode}|${amount}|${successUrl}|${failUrl}|${rnd}|${customerKey}|${merchantSecretKey}`
  return createHash("sha512").update(raw, "utf-8").digest("base64")
}

function getFormattedDate(): string {
  const now = new Date()
  const pad = (num: number) => num.toString().padStart(2, '0')
  const day = pad(now.getDate())
  const month = pad(now.getMonth() + 1)
  const year = now.getFullYear()
  const hours = pad(now.getHours())
  const minutes = pad(now.getMinutes())
  const seconds = pad(now.getSeconds())
  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`
}

class PaynkolayProviderService extends AbstractPaymentProvider {
  static identifier = "paynkolay"
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
    this.logger_.info("Paynkolay Provider: Initiating payment session.")
    this.logger_.debug(`Paynkolay Provider: Initiate payment inputs: ${JSON.stringify(input)}`)

    const rawAmount = typeof input.amount === "number" ? input.amount : Number(input.amount)
    const amountInLira = (rawAmount / 100).toFixed(2)
    const clientRefCode = (input.data?.session_id as string) || "session_pending"
    const rnd = getFormattedDate()
    
    const cfg = getPaynkolayConfig()
    const sx = cfg.sx
    const secretKey = cfg.secretKey
    const agentCode = cfg.agentCode

    const successUrl = cfg.successUrl
    const failUrl = cfg.failUrl

    const hashDataV2 = calculateHash(
      sx,
      clientRefCode,
      amountInLira,
      successUrl,
      failUrl,
      rnd,
      "",
      secretKey
    )

    this.logger_.info(`Paynkolay Provider: Payment session initiated successfully for clientRefCode: ${clientRefCode}. Amount: ${amountInLira} TL`)

    return {
      id: clientRefCode,
      data: {
        status: "pending",
        sx,
        amount: amountInLira,
        currencyCode: "949",
        clientRefCode,
        successUrl,
        failUrl,
        rnd,
        agentCode,
        transactionType: "SALES",
        use3D: "true",
        hashDataV2,
        actionUrl: cfg.baseUrl
      }
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const clientRefCode = input.data?.clientRefCode || input.data?.session_id || "N/A"
    this.logger_.info(`Paynkolay Provider: Authorizing payment. Reference: ${clientRefCode}`)
    this.logger_.debug(`Paynkolay Provider: Authorize payment inputs: ${JSON.stringify(input)}`)

    const isAuthorized = input.data?.status === "success" || input.data?.status === "authorized"
    
    if (isAuthorized) {
      this.logger_.info(`Paynkolay Provider: Payment ${clientRefCode} successfully authorized. Status: ${input.data?.status}`)
      return {
        status: "authorized",
        data: input.data
      }
    }

    this.logger_.warn(`Paynkolay Provider: Payment ${clientRefCode} is not fully authorized yet. Setting state to pending.`)
    return {
      status: "pending",
      data: input.data
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const clientRefCode = input.data?.clientRefCode || input.data?.session_id || "N/A"
    this.logger_.info(`Paynkolay Provider: Capturing payment. Reference: ${clientRefCode}`)
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
    this.logger_.info("Paynkolay Provider: Processing refund request.")
    this.logger_.debug(`Paynkolay Provider: Refund input: ${JSON.stringify(input)}`)

    if (!input.data) {
      this.logger_.error("Paynkolay Provider: Refund input data is missing completely.")
      throw new Error("Cannot refund payment: payment data is missing.")
    }

    const referenceCode = input.data.reference_code as string
    if (!referenceCode) {
      this.logger_.error("Paynkolay Provider: Cannot refund payment because reference_code is missing in payment data.")
      throw new Error("Cannot refund payment: reference_code is missing in payment data.")
    }

    const cfg = getPaynkolayConfig()
    const cancelSx = cfg.cancelSx
    const secretKey = cfg.secretKey

    // Amount in lira (Medusa input.amount is in cents)
    const amount = (Number(input.amount) / 100).toFixed(2)

    // Formatted trxDate: yyyy.MM.dd
    const dateObj = input.data.created_at ? new Date(input.data.created_at as string) : new Date()
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    const trxDate = `${year}.${month}.${day}`

    const type = "refund"

    // Signature: sx | referenceCode | type | amount | trxDate | merchantSecretKey
    const rawHash = `${cancelSx}|${referenceCode}|${type}|${amount}|${trxDate}|${secretKey}`
    const hashDatav2 = createHash("sha512").update(rawHash, "utf-8").digest("base64")

    const url = `${cfg.baseUrl}/v1/CancelRefundPayment`

    try {
      const formData = new URLSearchParams()
      formData.append("sx", cancelSx)
      formData.append("referenceCode", referenceCode)
      formData.append("type", type)
      formData.append("amount", amount)
      formData.append("trxDate", trxDate)
      formData.append("hashDatav2", hashDatav2)

      this.logger_.info(`Paynkolay Provider: Outbound Refund POST request to ${url}. Amount: ${amount} TL`)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      })

      if (!response.ok) {
        this.logger_.error(`Paynkolay Provider: Refund HTTP failure. Status: ${response.status}`)
        throw new Error(`Paynkolay CancelRefundPayment HTTP error! status: ${response.status}`)
      }

      const responseText = await response.text()
      let resultData: any
      try {
        resultData = JSON.parse(responseText)
      } catch (e) {
        this.logger_.error(`Paynkolay Provider: Refund response text was not valid JSON: ${responseText}`)
        throw new Error(`Paynkolay response is not valid JSON: ${responseText}`)
      }

      this.logger_.debug(`Paynkolay Provider: Refund response parsed successfully: ${JSON.stringify(resultData)}`)

      if (resultData.RESPONSE_CODE !== "2") {
        this.logger_.error(`Paynkolay Provider: Refund rejected by Paynkolay. Response Code: ${resultData.RESPONSE_CODE}, Msg: ${resultData.RESPONSE_DATA}`)
        throw new Error(`Paynkolay refund failed: ${resultData.RESPONSE_DATA || "Unknown error"}`)
      }

      this.logger_.info(`Paynkolay Provider: Refund processed successfully for Ref Code: ${referenceCode}. Amount: ${amount} TL`)

      return {
        data: {
          ...input.data,
          refunded_amount: typeof input.amount === "number" ? input.amount : Number(input.amount),
          status: "refunded",
          refund_response: resultData,
        },
      }
    } catch (error: any) {
      this.logger_.error(`Paynkolay Provider: Exception thrown during refund execution. Error: ${error.message || error}`)
      throw new Error(`Refund failed: ${error.message}`)
    }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    this.logger_.info("Paynkolay Provider: Processing void/cancel request.")
    this.logger_.debug(`Paynkolay Provider: Cancel input data: ${JSON.stringify(input)}`)

    if (!input.data) {
      this.logger_.error("Paynkolay Provider: Cancel input data is missing completely.")
      throw new Error("Cannot cancel payment: payment data is missing.")
    }

    const referenceCode = input.data.reference_code as string
    if (!referenceCode) {
      this.logger_.error("Paynkolay Provider: Cannot cancel payment because reference_code is missing in payment data.")
      throw new Error("Cannot cancel payment: reference_code is missing in payment data.")
    }

    const cfg = getPaynkolayConfig()
    const cancelSx = cfg.cancelSx
    const secretKey = cfg.secretKey

    // Amount in lira
    const rawAmount = input.data.received_amount || input.data.amount || 0
    const amount = typeof rawAmount === "string" ? rawAmount : (Number(rawAmount) / 100).toFixed(2)

    // Formatted trxDate: yyyy.MM.dd
    const dateObj = input.data.created_at ? new Date(input.data.created_at as string) : new Date()
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    const trxDate = `${year}.${month}.${day}`

    const type = "cancel"

    // Signature: sx | referenceCode | type | amount | trxDate | merchantSecretKey
    const rawHash = `${cancelSx}|${referenceCode}|${type}|${amount}|${trxDate}|${secretKey}`
    const hashDatav2 = createHash("sha512").update(rawHash, "utf-8").digest("base64")

    const url = `${cfg.baseUrl}/v1/CancelRefundPayment`

    try {
      const formData = new URLSearchParams()
      formData.append("sx", cancelSx)
      formData.append("referenceCode", referenceCode)
      formData.append("type", type)
      formData.append("amount", amount)
      formData.append("trxDate", trxDate)
      formData.append("hashDatav2", hashDatav2)

      this.logger_.info(`Paynkolay Provider: Outbound Cancel/Void POST request to ${url}. Amount: ${amount} TL`)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      })

      if (!response.ok) {
        this.logger_.error(`Paynkolay Provider: Cancel HTTP failure. Status: ${response.status}`)
        throw new Error(`Paynkolay CancelRefundPayment HTTP error! status: ${response.status}`)
      }

      const responseText = await response.text()
      let resultData: any
      try {
        resultData = JSON.parse(responseText)
      } catch (e) {
        this.logger_.error(`Paynkolay Provider: Cancel response text was not valid JSON: ${responseText}`)
        throw new Error(`Paynkolay response is not valid JSON: ${responseText}`)
      }

      this.logger_.debug(`Paynkolay Provider: Cancel response parsed successfully: ${JSON.stringify(resultData)}`)

      if (resultData.RESPONSE_CODE !== "2") {
        this.logger_.error(`Paynkolay Provider: Cancel rejected by Paynkolay. Response Code: ${resultData.RESPONSE_CODE}, Msg: ${resultData.RESPONSE_DATA}`)
        throw new Error(`Paynkolay cancel failed: ${resultData.RESPONSE_DATA || "Unknown error"}`)
      }

      this.logger_.info(`Paynkolay Provider: Payment cancelled/voided successfully. Ref Code: ${referenceCode}`)

      return {
        data: {
          ...input.data,
          status: "canceled",
          cancel_response: resultData,
        },
      }
    } catch (error: any) {
      this.logger_.error(`Paynkolay Provider: Exception thrown during cancel execution. Error: ${error.message || error}`)
      throw new Error(`Cancel failed: ${error.message}`)
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    this.logger_.info(`Paynkolay Provider: Deleting payment session data. Session ID: ${input.data?.id || "N/A"}`)
    return {
      data: input.data,
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const status = (input.data?.status as any) || "pending"
    this.logger_.debug(`Paynkolay Provider: Get status request. Status resolves to: ${status}`)
    return {
      status,
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    this.logger_.debug(`Paynkolay Provider: Retrieving payment data.`)
    return {
      data: input.data ?? {},
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    const clientRefCode = (input.data?.clientRefCode as string) || (input.data?.session_id as string) || "session_pending"
    this.logger_.info(`Paynkolay Provider: Updating payment session. ClientRefCode: ${clientRefCode}`)
    this.logger_.debug(`Paynkolay Provider: Update inputs: ${JSON.stringify(input)}`)

    const rawAmount = typeof input.amount === "number" ? input.amount : Number(input.amount)
    const amountInLira = (rawAmount / 100).toFixed(2)
    const rnd = getFormattedDate()
    
    const cfg = getPaynkolayConfig()
    const sx = cfg.sx
    const secretKey = cfg.secretKey
    const successUrl = cfg.successUrl
    const failUrl = cfg.failUrl

    const hashDataV2 = calculateHash(
      sx,
      clientRefCode,
      amountInLira,
      successUrl,
      failUrl,
      rnd,
      "",
      secretKey
    )

    this.logger_.info(`Paynkolay Provider: Payment session successfully updated for clientRefCode: ${clientRefCode}. New amount: ${amountInLira} TL`)

    return {
      data: {
        ...input.data,
        amount: amountInLira,
        rnd,
        hashDataV2,
      },
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    this.logger_.info("Paynkolay Provider: Webhook callback action received.")
    return {
      action: "captured",
      data: {
        session_id: payload.data.payment_session_id as string,
        amount: payload.data.amount as any,
      },
    }
  }
}

export const services = [PaynkolayProviderService]

export default {
  services: [PaynkolayProviderService],
}
