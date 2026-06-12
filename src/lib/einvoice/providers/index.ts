import { getEInvoiceConfig } from "../config"
import { DraftProvider } from "./draft"
import { InvoiceProvider } from "./types"

/**
 * Yapılandırılmış entegratöre göre uygun sağlayıcıyı döndürür. Şu an yalnız
 * "draft" (fail-closed) gerçeklenmiştir; entegratör adapter'ları (nilvera,
 * parasut, foriba...) buraya eklenecek:
 *
 *   case "nilvera": return new NilveraProvider(cfg)
 */
export function getInvoiceProvider(): InvoiceProvider {
  const cfg = getEInvoiceConfig()
  switch (cfg.provider) {
    // case "nilvera": ...
    // case "parasut": ...
    default:
      return new DraftProvider()
  }
}

export * from "./types"
