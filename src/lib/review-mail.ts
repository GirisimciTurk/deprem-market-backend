import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"

/**
 * Bir ürün yorumu admin tarafından "Yayınla" (approved) yapıldığında, yorum
 * sahibine (giriş yapmış müşteri) bilgilendirme e-postası gönderir. Yorumda
 * e-posta yoksa (misafir yorumu) atlanır. return-mail/cargo-mail deseniyle:
 * ÖNCE sendMail, SONRA önizleme (dev watcher tuzağı).
 */
export async function sendReviewPublishedEmail(
  container: any,
  review: {
    id: string
    customer_email?: string | null
    customer_name?: string | null
    product_title?: string | null
    rating?: number | null
    comment?: string | null
  }
): Promise<void> {
  const logger = container.resolve("logger")
  const to = review.customer_email
  if (!to) {
    logger.info("[ReviewMail] Yorum e-postası yok (misafir); mail atlanıyor.")
    return
  }

  const accent = "#16a34a"
  const name = review.customer_name?.trim() || "Değerli Müşterimiz"
  const product = review.product_title?.trim() || "ürün"
  const rating = Math.max(0, Math.min(5, Number(review.rating) || 0))
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating)
  const comment = (review.comment || "").trim()

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Değerlendirmeniz Yayınlandı - EKYP Deprem Market</title></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid ${accent};">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">EKYP DEPREM MARKET</h1>
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Değerlendirme</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: ${accent};">✅ Değerlendirmeniz Yayınlandı!</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; margin: 0 0 16px 0;">Sayın <strong>${name}</strong>,</p>
              <p style="font-size: 15px; line-height: 24px; color: #475569; margin-bottom: 24px;"><strong>${product}</strong> ürünü için yaptığınız değerlendirme onaylandı ve ürün sayfasında yayınlandı. Görüşünüzü paylaştığınız için teşekkür ederiz — diğer müşterilerimize yol gösteriyorsunuz.</p>
              <table width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <tr><td style="font-size: 22px; color: #f59e0b; letter-spacing: 2px; padding-bottom: 8px;">${stars}</td></tr>
                ${comment ? `<tr><td style="font-size: 14px; color: #475569; font-style: italic; line-height: 22px;">&ldquo;${comment}&rdquo;</td></tr>` : ""}
              </table>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                Her türlü soru için <strong>bilgi@girisimciturk.com</strong> adresinden bize ulaşabilirsiniz.
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
    subject: `Değerlendirmeniz Yayınlandı ✅ (${product})`,
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[ReviewMail] E-posta gönderildi: ${to}`)
  } else if (!result.configured) {
    logger.info("[ReviewMail] SMTP tanımlı değil; sadece önizleme kaydedildi.")
  } else {
    logger.error(`[ReviewMail] SMTP gönderimi başarısız: ${result.error}`)
  }

  const preview = writeEmailPreview(`review-published-${review.id}.html`, emailHtml)
  if (preview) logger.info(`[ReviewMail] Önizleme kaydedildi: ${preview}`)
}
