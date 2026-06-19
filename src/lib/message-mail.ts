import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"
import { emailShell } from "./email-shell"

const VENDOR_URL =
  process.env.VENDOR_PANEL_URL ||
  (process.env.VENDOR_DOMAIN ? `https://${process.env.VENDOR_DOMAIN}` : "http://localhost:5174")
const STORE_URL =
  process.env.STOREFRONT_URL ||
  (process.env.STOREFRONT_DOMAIN ? `https://${process.env.STOREFRONT_DOMAIN}` : "http://localhost:8000")

const shell = (heading: string, accent: string, bodyHtml: string): string =>
  emailShell({ heading, accent, subtitle: "Mesajlaşma", body: bodyHtml })

function quote(text: string): string {
  return `<blockquote style="margin:16px 0;padding:14px 18px;background:#f1f5f9;border-left:4px solid #2563eb;border-radius:6px;font-size:15px;color:#0f172a;">${text}</blockquote>`
}

/** Müşteri satıcıya mesaj attığında satıcıya bildirim. */
export async function sendMessageToSellerEmail(
  _container: any,
  data: { seller_email?: string | null; seller_name?: string; customer_name: string; body: string }
) {
  if (!data.seller_email) return
  const html = shell(
    "Bir müşteriden yeni mesaj",
    "#2563eb",
    `<p style="font-size:15px;line-height:24px;color:#475569;">Merhaba ${data.seller_name || "Satıcı"},
       <strong>${data.customer_name}</strong> adlı müşteriden yeni bir mesajınız var:</p>
     ${quote(data.body)}
     <p style="font-size:14px;color:#475569;">Satıcı panelinizdeki <strong>Mesajlar</strong> sayfasından yanıtlayabilirsiniz.</p>
     <p style="margin-top:24px;"><a href="${VENDOR_URL}/mesajlar" style="background:#2563eb;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">Mesajı Görüntüle</a></p>`
  )
  const r = await sendMail({ to: data.seller_email, subject: "Yeni müşteri mesajınız var", html })
  if (!r.configured) writeEmailPreview(`message-to-seller-${Date.now()}.html`, html)
}

/** Satıcı müşteriye yanıt verdiğinde müşteriye bildirim. */
export async function sendMessageToCustomerEmail(
  _container: any,
  data: { customer_email?: string | null; seller_name?: string; body: string }
) {
  if (!data.customer_email) return
  const html = shell(
    "Satıcıdan yeni mesaj",
    "#16a34a",
    `<p style="font-size:15px;line-height:24px;color:#475569;"><strong>${data.seller_name || "Satıcı"}</strong> mesajınıza yanıt verdi:</p>
     <blockquote style="margin:16px 0;padding:14px 18px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;font-size:15px;color:#0f172a;">${data.body}</blockquote>
     <p style="font-size:14px;color:#475569;">Hesabınızdaki <strong>Mesajlarım</strong> sayfasından yanıtlayabilirsiniz.</p>
     <p style="margin-top:24px;"><a href="${STORE_URL}/tr/account/mesajlar" style="background:#16a34a;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">Mesajı Görüntüle</a></p>`
  )
  const r = await sendMail({ to: data.customer_email, subject: "Satıcıdan yeni mesajınız var", html })
  if (!r.configured) writeEmailPreview(`message-to-customer-${Date.now()}.html`, html)
}
