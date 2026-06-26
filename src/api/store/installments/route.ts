import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHmac } from "crypto"
import { getPayTRConfig } from "../../../lib/paytr-config"

// GET /store/installments — PayTR taksit (installment) oranlarını döner.
//
// PayTR yapılandırılmamışsa (prod'da fail-closed → creds boş) graceful
// { success:false } döner; storefront bunu sorunsuz karşılar (response.success
// kontrol ediyor). Bu route'un VAR OLMASI, Medusa'nın /store grubuna otomatik
// uyguladığı STORE_CORS'u devreye sokar → daha önce route bulunmadığı için oluşan
// 404 + "No 'Access-Control-Allow-Origin'" konsol hatası ortadan kalkar.
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const cfg = getPayTRConfig()
  if (!cfg.configured) {
    return res.json({ success: false, data: null })
  }

  try {
    // PayTR taksit-oranları imzası: base64( HMAC-SHA256( merchant_id + merchant_salt, merchant_key ) )
    const paytrToken = createHmac("sha256", cfg.merchantKey)
      .update(cfg.merchantId + cfg.merchantSalt)
      .digest("base64")

    const form = new URLSearchParams()
    form.append("merchant_id", cfg.merchantId)
    form.append("paytr_token", paytrToken)

    const upstream = await fetch(`${cfg.baseUrl}/odeme/api/taksit-oranlari`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const data = await upstream.json().catch(() => null)
    if (!data) {
      return res.json({ success: false, data: null })
    }
    return res.json({ success: true, data })
  } catch {
    // PayTR'a ulaşılamazsa sayfa kırılmasın — graceful boş yanıt.
    return res.json({ success: false, data: null })
  }
}
