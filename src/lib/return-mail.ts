import fs from "fs"
import path from "path"
import { sendMail } from "./mailer"

export type ReturnStatus = "requested" | "received"

type StatusCopy = {
  subject: (no: string) => string
  heading: string
  emoji: string
  intro: string
  accent: string
  filePrefix: string
}

const COPY: Record<ReturnStatus, StatusCopy> = {
  requested: {
    subject: (no) => `İade Talebiniz Alındı (#${no})`,
    heading: "İade Talebiniz Alındı!",
    emoji: "↩️",
    intro:
      "İade talebiniz başarıyla oluşturulmuştur. Ekibimiz talebinizi inceleyip ürünü teslim aldıktan sonra ücret iadeniz başlatılacaktır. İade edilecek ürünler aşağıda listelenmiştir.",
    accent: "#d97706",
    filePrefix: "return-requested",
  },
  received: {
    subject: (no) => `İadeniz Onaylandı, Ücret İadesi Yapıldı (#${no})`,
    heading: "İadeniz Onaylandı!",
    emoji: "✅",
    intro:
      "İade talebiniz onaylanmıştır. Ücret iadeniz başlatılmış olup, ödeme yönteminize bağlı olarak birkaç iş günü içinde hesabınıza yansıyacaktır. Anlayışınız için teşekkür ederiz.",
    accent: "#16a34a",
    filePrefix: "return-received",
  },
}

/**
 * İade durumu değiştiğinde (talep alındı / teslim alındı) müşteriye e-posta gönderir.
 * SMTP tanımlı değilse `sent-emails/` altına önizleme HTML'i yazar. cargo-mail.ts
 * deseniyle birebir: ÖNCE sendMail, SONRA önizleme dosyası (dev watcher tuzağı).
 *
 * @param returnId  order.return_requested / order.return_received event'inden gelen data.return_id
 */
export async function sendReturnStatusEmail(
  container: any,
  returnId: string,
  status: ReturnStatus
) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")

  // İade kaydından order + iade kalemlerini çöz.
  const { data: returns } = await query.graph({
    entity: "return",
    fields: [
      "id",
      "status",
      "order.id",
      "order.email",
      "order.display_id",
      "items.quantity",
      "items.item.title",
    ],
    filters: { id: returnId },
  })

  const orderReturn = returns?.[0]
  const order = orderReturn?.order
  if (!order) {
    logger.error(`[ReturnMail:${status}] İade için sipariş bulunamadı: ${returnId}`)
    return
  }

  const num = (v: any) => Number(v ?? 0)
  const copy = COPY[status]

  const itemsHtml = (orderReturn.items || [])
    .map(
      (ri: any) => `
    <li style="padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; color: #475569;">
      <strong>${num(ri.quantity)}x</strong> ${ri.item?.title || "Ürün"}
    </li>`
    )
    .join("")

  const displayNo = order.display_id || order.id.substring(0, 8)

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>${copy.heading} - EKYP Deprem Market</title></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid ${copy.accent};">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">EKYP DEPREM MARKET</h1>
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">İade Durum Güncellemesi</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: ${copy.accent};">${copy.emoji} ${copy.heading}</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; text-align: center; margin-bottom: 30px;">${copy.intro}</p>
              <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 12px;">İade Edilen Ürünler (#${displayNo})</h3>
              <ul style="list-style-type: none; padding-left: 0; margin-top: 0; margin-bottom: 30px;">${itemsHtml || '<li style="font-size:14px;color:#475569;">—</li>'}</ul>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; margin-bottom: 10px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                İade süreciyle ilgili her türlü soru için bizimle <strong>bilgi@girisimciturk.com</strong> e-posta adresi üzerinden irtibata geçebilirsiniz.
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

  // ÖNCE SMTP ile gönder, SONRA önizleme yaz. Ortak pooled mailer + retry üzerinden.
  const result = await sendMail({
    to: order.email || undefined,
    subject: copy.subject(String(displayNo)),
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[ReturnMail:${status}] E-posta gönderildi: ${order.email}`)
  } else if (!result.configured) {
    logger.info(`[ReturnMail:${status}] SMTP tanımlı değil; sadece önizleme kaydedildi.`)
  } else {
    logger.error(`[ReturnMail:${status}] SMTP gönderimi başarısız (retry sonrası): ${result.error}`)
  }

  try {
    const dir = path.join(process.cwd(), "sent-emails")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, `${copy.filePrefix}-${displayNo}.html`), emailHtml)
    logger.info(`[ReturnMail:${status}] Önizleme kaydedildi: ${copy.filePrefix}-${displayNo}.html`)
  } catch (err: any) {
    logger.error(`[ReturnMail:${status}] Önizleme yazılamadı: ${err.message}`)
  }
}
