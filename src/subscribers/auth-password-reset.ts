import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendMail } from "../lib/mailer"
import { writeEmailPreview } from "../lib/email-preview"

type PasswordResetEvent = {
  entity_id: string // the account email/identifier
  actor_type: string // "user" for admin, "customer" for storefront
  token: string
}

export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEvent>) {
  const logger = container.resolve("logger")
  const { entity_id: email, actor_type, token } = data

  // Admin (user), müşteri (customer) ve satıcı (seller) şifre sıfırlama/belirlemesini
  // destekle; link hedefi ve metin actor'a göre değişir. Bilinmeyen actor tipini atla.
  const isAdmin = actor_type === "user"
  const isCustomer = actor_type === "customer"
  const isSeller = actor_type === "seller"
  if (!isAdmin && !isCustomer && !isSeller) {
    return
  }

  const q = `token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  const vendorBase =
    process.env.VENDOR_PANEL_URL ||
    (process.env.VENDOR_DOMAIN ? `https://${process.env.VENDOR_DOMAIN}` : "http://localhost:5174")
  const resetLink = isAdmin
    ? `${process.env.ADMIN_PANEL_URL || "http://localhost:5173"}/reset-password?${q}`
    : isSeller
    ? `${vendorBase}/sifre-belirle?${q}`
    : `${process.env.STOREFRONT_URL || "http://localhost:8000"}/tr/sifre-sifirla?${q}`

  const accent = isAdmin ? "#6366f1" : "#ea580c"
  const heading = isAdmin
    ? "depremTek Market Yönetim Paneli için bir şifre sıfırlama talebi aldık."
    : isSeller
    ? "Satıcı paneli hesabınız için şifrenizi belirleyebilir veya sıfırlayabilirsiniz."
    : "depremTek Market hesabınız için bir şifre sıfırlama talebi aldık."

  const emailHtml = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc;">
      <div style="background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
        <h1 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">${isSeller ? "Satıcı Paneli — Şifre Belirleme" : "Şifre Sıfırlama Talebi"}</h1>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          ${heading}
          Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın. Bu bağlantı sınırlı bir süre geçerlidir.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="display: inline-block; background: ${accent}; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px;">
            ${isSeller ? "Şifremi Belirle" : "Şifremi Sıfırla"}
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; line-height: 1.6;">
          Buton çalışmıyorsa bu bağlantıyı tarayıcınıza yapıştırın:<br/>
          <span style="color: ${accent}; word-break: break-all;">${resetLink}</span>
        </p>
        <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">
          Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.
        </p>
      </div>
    </div>
  `

  // Always save a local preview (proje DIŞINA) so resets are recoverable even without SMTP.
  const preview = writeEmailPreview(`password-reset-${email.replace(/[^a-z0-9]/gi, "_")}.html`, emailHtml)
  if (preview) logger.info(`[PasswordReset] Reset email preview saved: ${preview}`)
  logger.info(`[PasswordReset] Reset link for ${email}: ${resetLink}`)

  const result = await sendMail({
    to: email,
    subject: isAdmin
      ? "Şifre Sıfırlama — Yönetim Paneli"
      : isSeller
      ? "Satıcı Paneli — Şifrenizi Belirleyin"
      : "Şifre Sıfırlama — depremTek Market",
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[PasswordReset] Reset email sent to: ${email}`)
  } else if (!result.configured) {
    logger.info(
      "[PasswordReset] SMTP not configured. Use the reset link logged above or the preview in sent-emails/."
    )
  } else {
    logger.error(`[PasswordReset] SMTP dispatch failed (retry sonrası): ${result.error}`)
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
