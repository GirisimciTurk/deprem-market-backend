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

class IyzicoMockProviderService extends AbstractPaymentProvider {
  static identifier = "iyzico-mock"

  constructor(container: any, options: any) {
    super(container, options)
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    return {
      id: "iyzico-mock-session",
      data: {
        status: "pending",
        amount: input.amount,
        currency_code: input.currency_code,
      },
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    return {
      status: "authorized",
      data: {
        ...input.data,
        authorized_at: new Date().toISOString(),
        status: "authorized",
      },
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
    return {
      data: {
        ...input.data,
        refunded_amount: input.amount,
        status: "refunded",
      },
    }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    return {
      data: {
        ...input.data,
        status: "canceled",
      },
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return {
      data: input.data,
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    return {
      status: (input.data?.status as any) || "pending",
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return {
      data: input.data ?? {},
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    return {
      data: {
        ...input.data,
        amount: input.amount,
      },
    }
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

export const services = [IyzicoMockProviderService]

export default {
  services: [IyzicoMockProviderService],
}
