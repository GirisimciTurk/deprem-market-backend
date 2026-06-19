import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"
import { emailShell } from "./email-shell"

const VENDOR_URL =
  process.env.VENDOR_PANEL_URL ||
  (process.env.VENDOR_DOMAIN ? `https://${process.env.VENDOR_DOMAIN}` : "http://localhost:5174")

const shell = (heading: string, accent: string, bodyHtml: string): string =>
  emailShell({ heading, accent, subtitle: "Soru &amp; Cevap", body: bodyHtml })

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
