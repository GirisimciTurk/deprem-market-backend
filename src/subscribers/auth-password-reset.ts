import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import nodemailer from "nodemailer"
import fs from "fs"
import path from "path"

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

  // This panel only handles admin (user) resets. Customer resets would point to
  // the storefront, which is out of scope here.
  if (actor_type !== "user") {
    return
  }

  const adminUrl = process.env.ADMIN_PANEL_URL || "http://localhost:5173"
  const resetLink = `${adminUrl}/reset-password?token=${encodeURIComponent(
    token
  )}&email=${encodeURIComponent(email)}`

  const emailHtml = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f8fafc;">
      <div style="background: #fff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
        <h1 style="font-size: 20px; color: #0f172a; margin: 0 0 8px;">Şifre Sıfırlama Talebi</h1>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          Deprem Market Yönetim Paneli için bir şifre sıfırlama talebi aldık.
          Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın. Bu bağlantı sınırlı bir süre geçerlidir.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="display: inline-block; background: #6366f1; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px;">
            Şifremi Sıfırla
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; line-height: 1.6;">
          Buton çalışmıyorsa bu bağlantıyı tarayıcınıza yapıştırın:<br/>
          <span style="color: #6366f1; word-break: break-all;">${resetLink}</span>
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

  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort || "587"),
        secure: smtpPort === "465",
        auth: { user: smtpUser, pass: smtpPass },
      })

      await transporter.sendMail({
        from: `"EKYP Deprem Market" <${smtpUser}>`,
        to: email,
        subject: "Şifre Sıfırlama — Yönetim Paneli",
        html: emailHtml,
      })

      logger.info(`[PasswordReset] Reset email sent to: ${email}`)
    } catch (sendErr: any) {
      logger.error(`[PasswordReset] SMTP dispatch failed: ${sendErr.message}`)
    }
  } else {
    logger.info(
      "[PasswordReset] SMTP not configured. Use the reset link logged above or the preview in sent-emails/."
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
