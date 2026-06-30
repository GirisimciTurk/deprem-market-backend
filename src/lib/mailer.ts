import nodemailer, { type Transporter } from "nodemailer"

const FROM_NAME = "depremTek Market"

// Süreç-genelinde TEK pooled transporter. Her mailde yeni TCP/TLS el sıkışması yerine
// bağlantılar yeniden kullanılır (ölçekte SMTP'ye yük + gecikme azalır).
let cached: Transporter | null | undefined

function getTransporter(): Transporter | null {
  if (cached !== undefined) return cached
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    cached = null
    return null
  }
  cached = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587"),
    secure: SMTP_PORT === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  })
  return cached
}

export function isMailConfigured(): boolean {
  return getTransporter() !== null
}

export type MailOptions = {
  to?: string
  subject: string
  html: string
  from?: string
}

export type MailResult = { ok: boolean; configured: boolean; error?: string }

/**
 * Pooled transporter ile mail gönderir; geçici hatalarda kısa artan backoff ile RETRY yapar
 * (varsayılan 2 yeniden deneme). ASLA throw etmez → çağıran akış (subscriber/route) kırılmaz.
 *
 * @returns ok: gönderildi mi · configured: SMTP tanımlı mı · error: son hata mesajı
 */
export async function sendMail(opts: MailOptions, retries = 2): Promise<MailResult> {
  const transporter = getTransporter()
  if (!transporter) return { ok: false, configured: false }

  const from = opts.from || `"${FROM_NAME}" <${process.env.SMTP_USER}>`
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      })
      return { ok: true, configured: true }
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      }
    }
  }
  return { ok: false, configured: true, error: (lastErr as any)?.message }
}
