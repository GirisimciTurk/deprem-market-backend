import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"

/**
 * HAVAR talebi admin tarafından onaylanınca talep sahibine bilgilendirme e-postası.
 * "Talebiniz alındı/değerlendirildi, en yakın zamanda iletişime geçilecek."
 * return-mail/cargo-mail deseni: ÖNCE sendMail, SONRA önizleme (dev watcher tuzağı).
 */
export async function sendHavarApprovedEmail(
  container: any,
  request: {
    id: string
    email?: string | null
    full_name?: string | null
    type?: string | null
  }
): Promise<void> {
  const logger = container.resolve("logger")
  const to = request.email
  if (!to) {
    logger.info("[HavarMail] Talep e-postası yok; mail atlanıyor.")
    return
  }

  const greeting = request.full_name?.trim() || "Değerli Başvuru Sahibimiz"
  const tip = request.type === "rental" ? "ön kiralama" : "ön alım"
  const subject = "HavarTek Talebiniz Alındı — En Kısa Sürede İletişime Geçeceğiz"

  const html = `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"><title>HavarTek Talebiniz Alındı</title></head>
  <body style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f8fafc;margin:0;padding:0;color:#1e293b;">
    <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;margin:40px auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#143F73;padding:28px 30px;text-align:center;border-bottom:4px solid #F08C1A;">
          <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:1px;">Havar<span style="color:#F08C1A;">Tek</span></h1>
          <p style="color:#cbd5e1;margin:6px 0 0;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Hava Aracı Hizmetleri · depremTek</p>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 30px;">
          <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;text-align:center;color:#F08C1A;">✈️ Talebiniz Alındı</h2>
          <p style="font-size:15px;line-height:24px;color:#475569;margin:0 0 16px;">Sayın <strong>${greeting}</strong>,</p>
          <p style="font-size:15px;line-height:24px;color:#475569;margin:0 0 24px;">
            HavarTek ${tip} talebiniz tarafımıza ulaşmış ve değerlendirilmiştir.
            <strong>Sizinle en yakın zamanda iletişime geçilecektir.</strong>
            İlginiz için teşekkür ederiz.
          </p>
          <div style="background:#FEF6EA;border:1px solid #F9D195;border-radius:8px;padding:15px;font-size:13px;color:#7C4811;line-height:20px;text-align:center;">
            Her türlü soru için <strong>bilgi@girisimciturk.com</strong> adresinden bize ulaşabilirsiniz.
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#f8fafc;padding:22px 30px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;line-height:18px;">
          Bu e-posta HavarTek / depremTek tarafından otomatik gönderilmiştir.
        </td>
      </tr>
    </table>
  </body></html>`

  const result = await sendMail({ to, subject, html })
  if (result.ok) {
    logger.info(`[HavarMail] Onay e-postası gönderildi: ${to}`)
  } else if (!result.configured) {
    logger.info(`[HavarMail] SMTP tanımlı değil; sadece önizleme kaydedildi.`)
  } else {
    logger.error(`[HavarMail] SMTP gönderimi başarısız: ${result.error}`)
  }
  writeEmailPreview(`havar-approved-${request.id}.html`, html)
}
