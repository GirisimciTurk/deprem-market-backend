import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import fs from "fs"
import path from "path"
import { sendMail } from "../lib/mailer"

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

  // Hem admin (user) hem müşteri (customer) şifre sıfırlamasını destekle; link hedefi
  // ve metin actor'a göre değişir. Bilinmeyen actor tipini atla.
  const isAdmin = actor_type === "user"
  const isCustomer = actor_type === "customer"
  if (!isAdmin && !isCustomer) {
    return
  }

  const q = `token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  const resetLink = isAdmin
    ? `${process.env.ADMIN_PANEL_URL || "http://localhost:5173"}/reset-password?${q}`
    : `${process.env.STOREFRONT_URL || "http://localhost:8000"}/tr/sifre-sifirla?${q}`

  const accent = isAdmin ? "#6366f1" : "#ea580c"
  const heading = isAdmin
    ? "Deprem Market Yönetim Paneli için bir şifre sıfırlama talebi aldık."
    : "EKYP Deprem Market hesabınız için bir şifre sıfırlama talebi aldık."

  const emailHtml = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc;">
      <div style="background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
        <h1 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">Şifre Sıfırlama Talebi</h1>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          ${heading}
          Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın. Bu bağlantı sınırlı bir süre geçerlidir.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="display: inline-block; background: ${accent}; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px;">
            Şifremi Sıfırla
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

  // Always save a local preview so resets are recoverable even without SMTP.
  try {
    const dir = path.join(process.cwd(), "sent-emails")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    const filePath = path.join(dir, `password-reset-${email.replace(/[^a-z0-9]/gi, "_")}.html`)
    fs.writeFileSync(filePath, emailHtml)
    logger.info(`[PasswordReset] Reset email preview saved: ${filePath}`)
    logger.info(`[PasswordReset] Reset link for ${email}: ${resetLink}`)
  } catch (err: any) {
    logger.error(`[PasswordReset] Failed to write preview file: ${err.message}`)
  }

  const result = await sendMail({
    to: email,
    subject: isAdmin
      ? "Şifre Sıfırlama — Yönetim Paneli"
      : "Şifre Sıfırlama — EKYP Deprem Market",
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
