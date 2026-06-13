import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"

const VENDOR_URL =
  process.env.VENDOR_PANEL_URL ||
  (process.env.VENDOR_DOMAIN ? `https://${process.env.VENDOR_DOMAIN}` : "http://localhost:5174")

function shell(heading: string, accent: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f8fafc;margin:0;padding:0;color:#1e293b;">
    <table align="center" width="600" style="background:#fff;margin:40px auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:28px;text-align:center;border-bottom:4px solid ${accent};">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;text-transform:uppercase;">EKYP DEPREM MARKET</h1>
        <p style="color:#94a3b8;margin:5px 0 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Soru &amp; Cevap</p>
      </td></tr>
      <tr><td style="padding:36px 30px;">
        <h2 style="font-size:19px;font-weight:700;margin:0 0 16px;color:${accent};">${heading}</h2>
        ${bodyHtml}
      </td></tr>
      <tr><td style="background:#f8fafc;padding:22px 30px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
        Bu e-posta EKYP Deprem Market tarafından otomatik gönderilmiştir. | bilgi@girisimciturk.com
      </td></tr>
    </table>
  </body></html>`
}

/** Satıcıya "ürününüze yeni soru soruldu" bildirimi. */
export async function sendQuestionAskedEmail(
  _container: any,
  data: { seller_email?: string | null; seller_name?: string; product_title: string; question: string }
) {
  if (!data.seller_email) return
  const html = shell(
    "Ürününüze yeni bir soru soruldu",
    "#2563eb",
    `<p style="font-size:15px;line-height:24px;color:#475569;">Merhaba ${data.seller_name || "Satıcı"},
       <strong>${data.product_title}</strong> ürününüz için bir müşteri soru sordu:</p>
     <blockquote style="margin:16px 0;padding:14px 18px;background:#f1f5f9;border-left:4px solid #2563eb;border-radius:6px;font-size:15px;color:#0f172a;">${data.question}</blockquote>
     <p style="font-size:14px;color:#475569;">Satıcı panelinizdeki <strong>Sorular</strong> sayfasından yanıtlayabilirsiniz.</p>
     <p style="margin-top:24px;"><a href="${VENDOR_URL}/sorular" style="background:#2563eb;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">Soruyu Yanıtla</a></p>`
  )
  const r = await sendMail({ to: data.seller_email, subject: "Ürününüze yeni bir soru var", html })
  if (!r.configured) writeEmailPreview(`question-asked-${Date.now()}.html`, html)
}

/** Müşteriye "sorunuz yanıtlandı" bildirimi. */
export async function sendQuestionAnsweredEmail(
  _container: any,
  data: { customer_email?: string | null; product_title: string; question: string; answer: string }
) {
  if (!data.customer_email) return
  const html = shell(
    "Sorunuz yanıtlandı",
    "#16a34a",
    `<p style="font-size:15px;line-height:24px;color:#475569;"><strong>${data.product_title}</strong> ürünü hakkındaki sorunuz satıcı tarafından yanıtlandı:</p>
     <blockquote style="margin:14px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:6px;font-size:14px;color:#64748b;">${data.question}</blockquote>
     <blockquote style="margin:14px 0;padding:14px 18px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;font-size:15px;color:#0f172a;"><strong>Yanıt:</strong> ${data.answer}</blockquote>`
  )
  const r = await sendMail({ to: data.customer_email, subject: "Sorunuz yanıtlandı", html })
  if (!r.configured) writeEmailPreview(`question-answered-${Date.now()}.html`, html)
}
