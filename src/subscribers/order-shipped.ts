import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import nodemailer from "nodemailer"
import fs from "fs"
import path from "path"

type OrderShipmentEvent = {
  id: string
  order_id: string
}

export default async function orderShipmentHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderShipmentEvent>) {
  const orderId = data.order_id
  console.log(`[OrderShipmentSubscriber] Shipment event triggered for order: ${orderId}`)

  const query = container.resolve("query")
  
  // Fetch order with fulfillments and items
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "display_id",
      "created_at",
      "shipping_address.*",
      "fulfillments.tracking_numbers",
      "fulfillments.provider_id",
      "items.title",
      "items.quantity"
    ],
    filters: { id: orderId }
  })

  if (!orders || orders.length === 0) {
    console.error(`[OrderShipmentSubscriber] Order not found: ${orderId}`)
    return
  }

  const order = orders[0]
  console.log(`[OrderShipmentSubscriber] Order details fetched. Customer email: ${order.email}`)

  // Extract tracking numbers
  const trackingNumbers = (order.fulfillments || [])
    .flatMap((f: any) => f.tracking_numbers || [])
    .filter(Boolean)

  const trackingText = trackingNumbers.length > 0 
    ? trackingNumbers.join(", ") 
    : "Kargo takip numarası yakında aktif olacaktır."

  const itemsHtml = (order.items || []).map((item: any) => `
    <li style="padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; color: #475569;">
      <strong>${item.quantity}x</strong> ${item.title}
    </li>
  `).join("")

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Siparişiniz Kargoya Verildi - EKYP Deprem Market</title>
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
                Sipariş Durum Güncellemesi
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 15px; text-align: center; color: #e11d48;">
                🚚 Siparişiniz Kargoya Verildi!
              </h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; text-align: center; margin-bottom: 30px;">
                Afet hazırlık ekipmanlarınız kargo firmasına başarıyla teslim edilmiştir. Kargo durumunuzu aşağıdaki takip numarasıyla izleyebilirsiniz.
              </p>
              
              <!-- Tracking Info Box -->
              <table width="100%" style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 25px; margin-bottom: 30px; text-align: center;">
                <tr>
                  <td style="font-size: 13px; color: #be123c; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    Kargo Takip Numarası
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 1px;">
                    ${trackingText}
                  </td>
                </tr>
              </table>
              
              <!-- Order details -->
              <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 12px;">
                Kargolanan Ürünler (#${order.display_id || order.id.substring(0, 8)})
              </h3>
              <ul style="list-style-type: none; padding-left: 0; margin-top: 0; margin-bottom: 30px;">
                ${itemsHtml}
              </ul>
              
              <!-- Support Notice -->
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; margin-bottom: 30px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                Herhangi bir soru veya teslimat sorununuz için bizimle <strong>bilgi@girisimciturk.com</strong> e-posta adresi üzerinden irtibata geçebilirsiniz.
              </div>
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

  // Save backup HTML file locally for testing
  try {
    const dir = path.join(process.cwd(), "sent-emails")
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
    const filePath = path.join(dir, `shipped-${order.display_id || order.id}.html`)
    fs.writeFileSync(filePath, emailHtml)
    console.log(`[OrderShipmentSubscriber] Shipped email preview successfully saved: ${filePath}`)
  } catch (err: any) {
    console.error(`[OrderShipmentSubscriber] Failed to write shipped email preview:`, err.message)
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
        subject: `Siparişiniz Kargoya Verildi! (#${order.display_id || order.id.substring(0, 8)})`,
        html: emailHtml,
      })

      console.log(`[OrderShipmentSubscriber] Live shipping confirmation sent to: ${order.email}`)
    } catch (sendErr: any) {
      console.error(`[OrderShipmentSubscriber] SMTP dispatch failed:`, sendErr.message)
    }
  } else {
    console.log(`[OrderShipmentSubscriber] SMTP credentials not set. Saved visual preview inside: apps/backend/sent-emails/`)
  }
}

export const config: SubscriberConfig = {
  event: "order.shipment.created",
}
