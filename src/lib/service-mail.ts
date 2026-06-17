import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"
import type { ServicePhase } from "../api/_lib/service-payment"

/**
 * Hizmet talebi (keşifli kurulum) ödeme bildirimleri. Müşteri bir fazı (keşif
 * ücreti / kapora / bakiye) ödeyince teşekkür + makbuz niteliğinde e-posta gider.
 * Tutarlar TAM LİRA (major). SMTP yoksa sent-emails/ altına önizleme yazılır.
 */

const PHASE_LABEL: Record<ServicePhase, string> = {
  survey: "Keşif Ücreti",
  deposit: "Kapora",
  balance: "Bakiye",
}

/** 1234 → "1.234 ₺" (TL major, tam sayı). */
function formatLira(v: number): string {
  return `${Math.round(Number(v ?? 0)).toLocaleString("tr-TR")} ₺`
}

export async function sendServicePaymentEmail(
  scope: any,
  request: any,
  phase: ServicePhase,
  amountMajor: number
): Promise<void> {
  const logger = scope.resolve("logger")
  const phaseLabel = PHASE_LABEL[phase] ?? "Ödeme"
  const title = request?.service_title || "Özel Hizmet"
  const ref = String(request?.id || "").slice(0, 8).toUpperCase()
  const paidTotal = Number(request?.paid_total ?? 0)

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>${phaseLabel} Ödemeniz Alındı - EKYP Deprem Market</title></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid #16a34a;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">EKYP DEPREM MARKET</h1>
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Hizmet Ödeme Bildirimi</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: #16a34a;">✅ ${phaseLabel} Ödemeniz Alındı</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; text-align: center; margin-bottom: 30px;">
                <strong>${title}</strong> hizmetiniz için <strong>${phaseLabel.toLowerCase()}</strong> ödemeniz başarıyla alınmıştır. Tahsilat, iş teslim edilene kadar güvence (koruma) hesabında tutulur.
              </p>
              <table width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin-bottom: 24px; text-align: center;">
                <tr><td style="font-size: 13px; color: #16a34a; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">${phaseLabel}</td></tr>
                <tr><td style="font-size: 28px; font-weight: 800; color: #0f172a;">${formatLira(amountMajor)}</td></tr>
              </table>
              <div style="font-size: 14px; color: #475569; line-height: 22px; text-align: center; margin-bottom: 8px;">
                Talep No: <strong>#${ref}</strong><br>
                Bugüne kadar tahsil edilen toplam: <strong>${formatLira(paidTotal)}</strong>
              </div>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; margin-top: 24px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                Talebinizin durumunu hesabınızdan <strong>“Hizmet Taleplerim”</strong> sayfasından takip edebilirsiniz. Sorularınız için <strong>bilgi@girisimciturk.com</strong>.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 18px;">
              Bu e-posta <strong>DEV YAPIMCILIK YAYINCILIK SAN. TİC. LTD. ŞTİ.</strong> iştiraki olan EKYP Deprem Market tarafından otomatik olarak gönderilmiştir.<br>
              Karşıyaka Mah. 612 Cad. No:50, Gölbaşı/Ankara | bilgi@girisimciturk.com
            </td>
          </tr>
        </table>
      </body>
    </html>`

  const result = await sendMail({
    to: request?.email || undefined,
    subject: `${phaseLabel} Ödemeniz Alındı (#${ref})`,
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[ServiceMail:${phase}] E-posta gönderildi: ${request?.email}`)
  } else if (!result.configured) {
    logger.info(`[ServiceMail:${phase}] SMTP tanımlı değil; sadece önizleme kaydedildi.`)
  } else {
    logger.error(`[ServiceMail:${phase}] SMTP gönderimi başarısız: ${result.error}`)
  }

  const preview = writeEmailPreview(`service-${phase}-${ref}.html`, emailHtml)
  if (preview) logger.info(`[ServiceMail:${phase}] Önizleme kaydedildi: ${preview}`)
}
