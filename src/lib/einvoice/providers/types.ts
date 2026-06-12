/**
 * Entegratör-bağımsız e-fatura sağlayıcı arayüzü. Yeni bir entegratör eklemek
 * için bu arayüzü uygulayan bir adapter yazılır ve providers/index.ts factory'sine
 * eklenir. Gönderim, UBL-TR taslak yapısını (Invoice.ubl_payload) alır.
 */
export type SendInvoiceInput = {
  invoiceId: string
  type: "sale" | "commission"
  draftNumber: string
  ublPayload: unknown
}

export type SendInvoiceResult = {
  status: "sent" | "error"
  externalId?: string
  invoiceNumber?: string
  error?: string
}

export interface InvoiceProvider {
  readonly name: string
  /** Entegratör kimliği tanımlı mı (gönderim yapılabilir mi). */
  readonly configured: boolean
  send(input: SendInvoiceInput): Promise<SendInvoiceResult>
}
