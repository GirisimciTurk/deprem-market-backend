import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"
import { specializationLabel } from "./expert-config"

/**
 * Uzman ön-kayıt formu gönderildiğinde başvuran mühendise teşekkür/onay e-postası
 * gönderir (discovery: kişi kendini dinlenmiş hisseder, erken kayıt listesi güveni).
 * SMTP yoksa sent-emails/ altına önizleme yazar. reseller-mail.ts deseni: ÖNCE
 * sendMail, SONRA önizleme dosyası (dev watcher tuzağı).
 */
export async function sendExpertLeadConfirmation(
  container: any,
  lead: {
    id: string
    email?: string | null
    full_name?: string | null
    specializations?: string[] | null
  }
): Promise<void> {
  const logger = container.resolve("logger")
  const to = lead.email
  if (!to) {
    logger.info("[ExpertMail] Başvuru e-postası yok; mail atlanıyor.")
    return
  }

  const greetingName = lead.full_name?.trim() || "Değerli Meslektaşımız"
  const specs = (lead.specializations ?? [])
    .map((k) => specializationLabel(k))
    .filter(Boolean)

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Uzman Ön Kaydınız Alındı - EKYP Deprem Market</title></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid #ea8a1e;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">EKYP DEPREM MARKET</h1>
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Uzman Ağı — Ön Kayıt</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: #ea8a1e;">✅ Ön Kaydınız Alındı</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; margin: 0 0 16px 0;">Sayın <strong>${greetingName}</strong>,</p>
              <p style="font-size: 15px; line-height: 24px; color: #475569; margin-bottom: 24px;">
                Deprem Güvenliği Platformu <strong>doğrulanmış uzman dizinine</strong> ön kayıt talebiniz bize ulaştı. Ekibimiz başvurunuzu değerlendirip belge doğrulaması ve sonraki adımlar için sizinle iletişime geçecektir. İlginiz, halkın güvenli mühendislere erişmesi için çok değerli.
              </p>
              ${
                specs.length
                  ? `<table width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                       <tr><td style="font-size: 13px; color: #64748b;">Belirttiğiniz uzmanlık alanları</td></tr>
                       <tr><td style="font-size: 15px; font-weight: 600; color: #0f172a; padding-top: 4px;">${specs.join(" · ")}</td></tr>
                     </table>`
                  : ""
              }
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                Sorularınız için <strong>bilgi@girisimciturk.com</strong> adresinden bize ulaşabilirsiniz.
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
    to,
    subject: "Uzman Ön Kaydınız Alındı — EKYP Deprem Market",
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[ExpertMail] Onay e-postası gönderildi: ${to}`)
  } else if (!result.configured) {
    logger.info("[ExpertMail] SMTP tanımlı değil; sadece önizleme kaydedildi.")
  } else {
    logger.error(`[ExpertMail] SMTP gönderimi başarısız: ${result.error}`)
  }

  const preview = writeEmailPreview(`expert-lead-${lead.id}.html`, emailHtml)
  if (preview) logger.info(`[ExpertMail] Önizleme kaydedildi: ${preview}`)
}
