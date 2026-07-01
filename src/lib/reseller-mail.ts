import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"

export type ResellerMailStatus = "approved" | "rejected" | "suspended"

type StatusCopy = {
  subject: string
  heading: string
  emoji: string
  intro: string
  accent: string
  filePrefix: string
}

const COPY: Record<ResellerMailStatus, StatusCopy> = {
  approved: {
    subject: "Bayilik Başvurunuz Onaylandı 🎉",
    heading: "Bayilik Başvurunuz Onaylandı!",
    emoji: "🎉",
    intro:
      "Bayilik başvurunuz değerlendirilmiş ve ONAYLANMIŞTIR. Aramıza hoş geldiniz! Satıcı panelinize giriş yaparak ürünlerinizi eklemeye ve satışa başlayabilirsiniz. Giriş bilgileriniz ve sonraki adımlar için ekibimiz sizinle iletişime geçecektir.",
    accent: "#16a34a",
    filePrefix: "reseller-approved",
  },
  rejected: {
    subject: "Bayilik Başvurunuz Hakkında",
    heading: "Bayilik Başvurunuz Değerlendirildi",
    emoji: "📋",
    intro:
      "Bayilik başvurunuz ekibimiz tarafından dikkatle incelenmiştir. Maalesef başvurunuz şu an için olumlu sonuçlanmamıştır. İlginiz için teşekkür eder, koşulların uygun olması halinde tekrar başvurabileceğinizi belirtmek isteriz.",
    accent: "#dc2626",
    filePrefix: "reseller-rejected",
  },
  suspended: {
    subject: "Bayilik Hesabınız Askıya Alındı",
    heading: "Bayilik Hesabınız Askıya Alındı",
    emoji: "⏸️",
    intro:
      "Bayilik hesabınız geçici olarak askıya alınmıştır. Bu süreçte satış işlemleriniz duraklatılmıştır. Detaylı bilgi ve hesabınızın yeniden aktifleştirilmesi için lütfen bizimle iletişime geçin.",
    accent: "#d97706",
    filePrefix: "reseller-suspended",
  },
}

// Firma (kurumsal iş ortaklığı) başvuruları için ayrı metinler. Bayilik metinleri
// satıcı paneli/ürün satışına atıfta bulunur; firma için bunlar uygun düşmez.
const FIRMA_COPY: Record<ResellerMailStatus, StatusCopy> = {
  approved: {
    subject: "Firma İş Ortaklığı Başvurunuz Onaylandı 🎉",
    heading: "Firma İş Ortaklığı Başvurunuz Onaylandı!",
    emoji: "🎉",
    intro:
      "Firma iş ortaklığı başvurunuz değerlendirilmiş ve ONAYLANMIŞTIR. Aramıza hoş geldiniz! İş birliğinin kapsamı ve sonraki adımlar için kurumsal ekibimiz en kısa sürede sizinle iletişime geçecektir.",
    accent: "#16a34a",
    filePrefix: "firma-approved",
  },
  rejected: {
    subject: "Firma İş Ortaklığı Başvurunuz Hakkında",
    heading: "Firma İş Ortaklığı Başvurunuz Değerlendirildi",
    emoji: "📋",
    intro:
      "Firma iş ortaklığı başvurunuz ekibimiz tarafından dikkatle incelenmiştir. Maalesef başvurunuz şu an için olumlu sonuçlanmamıştır. İlginiz için teşekkür eder, koşulların uygun olması halinde tekrar değerlendirmekten memnuniyet duyarız.",
    accent: "#dc2626",
    filePrefix: "firma-rejected",
  },
  suspended: {
    subject: "Firma İş Ortaklığınız Askıya Alındı",
    heading: "Firma İş Ortaklığınız Askıya Alındı",
    emoji: "⏸️",
    intro:
      "Firma iş ortaklığınız geçici olarak askıya alınmıştır. Detaylı bilgi ve yeniden aktifleştirme için lütfen kurumsal ekibimizle iletişime geçin.",
    accent: "#d97706",
    filePrefix: "firma-suspended",
  },
}

/**
 * Bayilik başvurusunun durumu değiştiğinde (onay/red/askıya alma) başvuru
 * sahibine sonuç e-postası gönderir. SMTP tanımlı değilse `sent-emails/` altına
 * önizleme yazar. return-mail.ts / cargo-mail.ts deseniyle birebir: ÖNCE sendMail,
 * SONRA önizleme dosyası (dev watcher tuzağı).
 */
export async function sendResellerStatusEmail(
  container: any,
  application: {
    id: string
    email?: string | null
    company_name?: string | null
    applicant_name?: string | null
    application_type?: "bayi" | "firma" | null
  },
  status: ResellerMailStatus
): Promise<void> {
  const logger = container.resolve("logger")
  const to = application.email
  if (!to) {
    logger.info("[ResellerMail] Başvuru e-postası yok; mail atlanıyor.")
    return
  }

  const isFirma = application.application_type === "firma"
  const subLabel = isFirma ? "Firma Başvurusu" : "Bayilik Başvurusu"
  const copy = (isFirma ? FIRMA_COPY : COPY)[status]
  const greetingName =
    application.applicant_name?.trim() || application.company_name?.trim() || "Değerli İş Ortağımız"
  const company = application.company_name?.trim()

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>${copy.heading} - depremTek Market</title></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid ${copy.accent};">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">DEPREMTEK MARKET</h1>
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${subLabel}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: ${copy.accent};">${copy.emoji} ${copy.heading}</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; margin: 0 0 16px 0;">Sayın <strong>${greetingName}</strong>,</p>
              <p style="font-size: 15px; line-height: 24px; color: #475569; margin-bottom: 24px;">${copy.intro}</p>
              ${
                company
                  ? `<table width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                       <tr><td style="font-size: 13px; color: #64748b;">Başvuran Firma</td></tr>
                       <tr><td style="font-size: 16px; font-weight: 700; color: #0f172a; padding-top: 4px;">${company}</td></tr>
                     </table>`
                  : ""
              }
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                Her türlü soru için bizimle <strong>bilgi@girisimciturk.com</strong> adresinden iletişime geçebilirsiniz.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 18px;">
              Bu e-posta <strong>DEV YAPIMCILIK YAYINCILIK SAN. TİC. LTD. ŞTİ.</strong> iştiraki olan depremTek Market tarafından otomatik olarak gönderilmiştir.<br>
              Karşıyaka Mah. 612 Cad. No:50, Gölbaşı/Ankara | bilgi@girisimciturk.com
            </td>
          </tr>
        </table>
      </body>
    </html>`

  const result = await sendMail({ to, subject: copy.subject, html: emailHtml })
  if (result.ok) {
    logger.info(`[ResellerMail:${status}] E-posta gönderildi: ${to}`)
  } else if (!result.configured) {
    logger.info(`[ResellerMail:${status}] SMTP tanımlı değil; sadece önizleme kaydedildi.`)
  } else {
    logger.error(`[ResellerMail:${status}] SMTP gönderimi başarısız: ${result.error}`)
  }

  const preview = writeEmailPreview(`${copy.filePrefix}-${application.id}.html`, emailHtml)
  if (preview) logger.info(`[ResellerMail:${status}] Önizleme kaydedildi: ${preview}`)
}
