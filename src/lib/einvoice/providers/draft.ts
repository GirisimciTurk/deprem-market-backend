import { InvoiceProvider, SendInvoiceInput, SendInvoiceResult } from "./types"

/**
 * Varsayılan "draft" sağlayıcı — entegratör bağlı DEĞİLKEN kullanılır (fail-closed).
 * Gerçek gönderim yapmaz; faturayı taslak olarak bırakır. Bir entegratör
 * bağlandığında EINVOICE_PROVIDER ile gerçek adapter devreye girer.
 */
export class DraftProvider implements InvoiceProvider {
  readonly name = "draft"
  readonly configured = false

  async send(_input: SendInvoiceInput): Promise<SendInvoiceResult> {
    return {
      status: "error",
      error:
        "E-fatura entegratörü tanımlı değil (draft modu). Gönderim için EINVOICE_PROVIDER ve kimlikleri ayarlayın.",
    }
  }
}
