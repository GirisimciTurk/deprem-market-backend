import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import nodemailer from "nodemailer"
import fs from "fs"
import path from "path"

type OrderPlacedEvent = {
  id: string
}

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  const orderId = data.id
  const logger = container.resolve("logger")
  logger.info(`[OrderPlacedSubscriber] Order placed event triggered for order: ${orderId}`)

  const query = container.resolve("query")
  
  // Fetch order with items
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "total",
      "currency_code",
      "display_id",
      "created_at",
      "shipping_address.*",
      "items.title",
      "items.quantity",
      "items.unit_price"
    ],
    filters: { id: orderId }
  })

  if (!orders || orders.length === 0) {
    logger.error(`[OrderPlacedSubscriber] Order not found: ${orderId}`)
    return
  }

  const order = orders[0]
  logger.info(`[OrderPlacedSubscriber] Order details fetched. Customer email: ${order.email}`)

  // Generate HTML Items list
  const itemsHtml = (order.items || []).map((item: any) => {
    const price = (item.unit_price / 100).toFixed(2)
    const total = ((item.unit_price * item.quantity) / 100).toFixed(2)
    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #1e293b;">${item.title}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: center; color: #475569;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right; color: #475569;">${price} ${order.currency_code.toUpperCase()}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; text-align: right; font-weight: bold; color: #1e293b;">${total} ${order.currency_code.toUpperCase()}</td>
      </tr>
    `
  }).join("")

  const grandTotal = (order.total / 100).toFixed(2)

  // Custom styled template
  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Siparişiniz Alındı - EKYP Deprem Market</title>
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid #e11d48;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
                EKYP DEPREM MARKET
              </h1>
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Acil Durum & Afet Hazırlık Mağazası
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 15px;">
                Sayın Müşterimiz,
              </h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; margin-bottom: 30px;">
                Siparişiniz başarıyla alınmıştır. Afet hazırlık setiniz ve acil durum ekipmanlarınız en kısa sürede (24-48 saat içerisinde) hazırlanarak kargoya verilecektir.
              </p>
              
              <!-- Order Info -->
              <table width="100%" style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                <tr>
                  <td style="font-size: 13px; color: #64748b; padding-bottom: 5px;">Sipariş Numarası:</td>
                  <td style="font-size: 13px; color: #64748b; padding-bottom: 5px; text-align: right;">Tarih:</td>
                </tr>
                <tr>
                  <td style="font-size: 16px; font-weight: bold; color: #0f172a;">#${order.display_id || order.id.substring(0, 8)}</td>
                  <td style="font-size: 15px; font-weight: bold; color: #0f172a; text-align: right;">${new Date(order.created_at).toLocaleDateString("tr-TR")}</td>
                </tr>
              </table>
              
              <!-- Products Table -->
              <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px;">
                Sipariş Özeti
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                  <tr style="background-color: #f8fafc;">
                    <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #64748b; font-weight: bold; border-bottom: 2px solid #e2e8f0;">Ürün</th>
                    <th style="padding: 8px 12px; text-align: center; font-size: 12px; color: #64748b; font-weight: bold; border-bottom: 2px solid #e2e8f0; width: 60px;">Adet</th>
                    <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #64748b; font-weight: bold; border-bottom: 2px solid #e2e8f0; width: 100px;">Birim Fiyat</th>
                    <th style="padding: 8px 12px; text-align: right; font-size: 12px; color: #64748b; font-weight: bold; border-bottom: 2px solid #e2e8f0; width: 100px;">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                  <tr>
                    <td colspan="2" style="padding: 15px 12px; font-size: 16px; font-weight: bold; color: #0f172a;">Genel Toplam</td>
                    <td colspan="2" style="padding: 15px 12px; font-size: 18px; font-weight: 800; color: #e11d48; text-align: right;">
                      ${grandTotal} ${order.currency_code.toUpperCase()}
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- Delivery Notice -->
              <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 15px; margin-bottom: 30px; font-size: 13px; color: #be123c; line-height: 20px;">
                <strong>💡 Önemli Not:</strong> Paketiniz kargo firmasına teslim edildiğinde, kargo takip numaranız size e-posta yoluyla otomatik olarak iletilecektir.
              </div>
              
              <p style="font-size: 14px; color: #64748b; text-align: center; margin-top: 40px; margin-bottom: 0;">
                Bizleri tercih ettiğiniz için teşekkür eder, güvenli günler dileriz.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 18px;">
              Bu e-posta <strong>DEV YAPIMCILIK YAYINCILIK SAN. TİC. LTD. ŞTİ.</strong> iştiraki olan EKYP Deprem Market tarafından otomatik olarak gönderilmiştir.<br>
              Karşıyaka Mah. 612 Cad. No:50, Gölbaşı/Ankara | bilgi@girisimciturk.com
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

  // Save localized backup HTML file to watch locally
  try {
    const dir = path.join(process.cwd(), "sent-emails")
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
    const filePath = path.join(dir, `order-${order.display_id || order.id}.html`)
    fs.writeFileSync(filePath, emailHtml)
    logger.info(`[OrderPlacedSubscriber] Visual email backup successfully saved: ${filePath}`)
  } catch (err: any) {
    logger.error(`[OrderPlacedSubscriber] Failed to write preview file: ${err.message}`)
  }

  // Dispatch via SMTP if configurations exist
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
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      })

      await transporter.sendMail({
        from: `"EKYP Deprem Market" <${smtpUser}>`,
        to: order.email || undefined,
        subject: `Siparişiniz Alındı (#${order.display_id || order.id.substring(0, 8)})`,
        html: emailHtml,
      })

      logger.info(`[OrderPlacedSubscriber] Live confirmation email sent to: ${order.email}`)
    } catch (sendErr: any) {
      logger.error(`[OrderPlacedSubscriber] SMTP dispatch failed: ${sendErr.message}`)
    }
  } else {
    logger.info(`[OrderPlacedSubscriber] SMTP credentials not set. Saved visual preview inside: apps/backend/sent-emails/`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
