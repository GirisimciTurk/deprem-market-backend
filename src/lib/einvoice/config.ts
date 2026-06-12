/**
 * E-fatura yapılandırması (entegratör-bağımsız, merkezî).
 *
 * Entegratör kimliği TANIMLI DEĞİLSE sistem "draft" modunda çalışır: faturalar
 * üretilir ve saklanır ama GİB'e gönderilmez (fail-closed). Bir entegratör
 * (Nilvera/Paraşüt/Foriba/Uyumsoft...) bağlanınca EINVOICE_PROVIDER + ilgili
 * kimlikler set edilir ve gönderim açılır.
 */
export type EInvoiceConfig = {
  provider: string // "draft" (varsayılan) | entegratör adı
  configured: boolean
  apiKey?: string
  apiSecret?: string
  baseUrl?: string
  testMode: boolean
  // Platform (satıcı tarafı) künyesi — komisyon faturalarında düzenleyen.
  seller: {
    name: string
    taxNumber?: string
    taxOffice?: string
    address?: string
  }
  // Varsayılan KDV oranı (ürün/region vergisi yoksa). Fiyatlar KDV DAHİL kabul edilir.
  defaultKdvRate: number
}

export function getEInvoiceConfig(): EInvoiceConfig {
  const provider = (process.env.EINVOICE_PROVIDER || "draft").trim().toLowerCase()
  const apiKey = process.env.EINVOICE_API_KEY?.trim() || undefined
  const apiSecret = process.env.EINVOICE_API_SECRET?.trim() || undefined
  const baseUrl = process.env.EINVOICE_BASE_URL?.trim() || undefined

  // "configured" = gerçek bir entegratör seçilmiş VE en az API anahtarı var.
  const configured = provider !== "draft" && !!apiKey

  return {
    provider,
    configured,
    apiKey,
    apiSecret,
    baseUrl,
    testMode: (process.env.EINVOICE_TEST_MODE || "true").toLowerCase() !== "false",
    seller: {
      name: process.env.EINVOICE_SELLER_NAME || "DEV YAPIMCILIK YAYINCILIK SAN. TİC. LTD. ŞTİ.",
      taxNumber: process.env.EINVOICE_SELLER_TAX_NUMBER || undefined,
      taxOffice: process.env.EINVOICE_SELLER_TAX_OFFICE || undefined,
      address: process.env.EINVOICE_SELLER_ADDRESS || "Karşıyaka Mah. 612 Cad. No:50, Gölbaşı/Ankara",
    },
    defaultKdvRate: Number(process.env.EINVOICE_DEFAULT_KDV ?? 20),
  }
}
