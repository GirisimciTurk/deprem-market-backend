import { getTrackingUrl, resolveCarrier, CarrierCode } from "./cargo"
import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"

/**
 * Bir satıcı alt-siparişini (seller_order) kargoladığında müşteriye gönderilen
 * "kargoya verildi" e-postası. Çok-satıcılı sepette her satıcı kendi paketini
 * ayrı kargolar → müşteri her satıcıdan ayrı kargo maili alır.
 *
 * cargo-mail.ts'ten farkı: Medusa fulfillment yerine seller_order kaydından
 * (items snapshot + customer_email + tracking) beslenir. ÖNCE sendMail, SONRA
 * önizleme yazılır (dev watcher tuzağı — bkz. cargo-mail.ts).
 */
export async function sendSellerShipmentEmail(
  container: any,
  sellerOrder: any,
  sellerName: string
): Promise<void> {
  const logger = container.resolve("logger")

  const to = sellerOrder.customer_email
  if (!to) {
    logger.info("[SellerCargoMail] Müşteri e-postası yok; mail atlanıyor.")
    return
  }

  const num = (v: any) => Number(v ?? 0)
  const accent = "#e11d48"
  const carrierCode = (sellerOrder.carrier as CarrierCode) || undefined
  const carrierName = carrierCode ? resolveCarrier(carrierCode).name : "Kargo"
  const trackingNumber = (sellerOrder.tracking_number || "").trim()
  const trackingUrl =
    sellerOrder.tracking_url ||
    (trackingNumber ? getTrackingUrl(trackingNumber, carrierCode) : null)

  const displayNo = sellerOrder.display_id || String(sellerOrder.order_id).substring(0, 8)

  const trackingHtml = trackingNumber
    ? `
        <div style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 1px; margin-bottom: 10px;">${trackingNumber}</div>
        ${
          trackingUrl
            ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${accent}; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 10px 22px; border-radius: 8px; letter-spacing: 0.5px;">Kargom Nerede? (${carrierName})</a>`
            : ""
        }`
    : `<div style="font-size: 16px; font-weight: 700; color: #0f172a;">Kargo takip numarası yakında aktif olacaktır.</div>`

  const items: any[] = Array.isArray(sellerOrder.items) ? sellerOrder.items : []
  const itemsHtml = items
    .map(
      (item: any) => `
    <li style="padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; color: #475569;">
      <strong>${num(item.quantity)}x</strong> ${item.title || ""}
    </li>`
    )
    .join("")

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Siparişiniz Kargoya Verildi - EKYP Deprem Market</title></head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid ${accent};">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">EKYP DEPREM MARKET</h1>
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Sipariş Durum Güncellemesi</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: ${accent};">🚚 Siparişiniz Kargoya Verildi!</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; text-align: center; margin-bottom: 30px;"><strong>${sellerName}</strong> satıcısından gönderdiğiniz ürünler kargo firmasına teslim edilmiştir. Kargo durumunuzu aşağıdaki takip numarasıyla izleyebilirsiniz.</p>
              <table width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin-bottom: 30px; text-align: center;">
                <tr><td style="font-size: 13px; color: ${accent}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">${carrierName} Takip Numarası</td></tr>
                <tr><td>${trackingHtml}</td></tr>
              </table>
              <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 12px;">Kargolanan Ürünler (#${displayNo})</h3>
              <ul style="list-style-type: none; padding-left: 0; margin-top: 0; margin-bottom: 30px;">${itemsHtml}</ul>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; margin-bottom: 10px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                Herhangi bir soru veya teslimat sorununuz için bizimle <strong>bilgi@girisimciturk.com</strong> e-posta adresi üzerinden irtibata geçebilirsiniz.
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

  const result = await sendMail({
    to,
    subject: `Siparişiniz Kargoya Verildi! (#${displayNo})`,
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[SellerCargoMail] E-posta gönderildi: ${to}`)
  } else if (!result.configured) {
    logger.info("[SellerCargoMail] SMTP tanımlı değil; sadece önizleme kaydedildi.")
  } else {
    logger.error(`[SellerCargoMail] SMTP gönderimi başarısız: ${result.error}`)
  }

  const preview = writeEmailPreview(
    `seller-shipped-${displayNo}-${sellerOrder.id}.html`,
    emailHtml
  )
  if (preview) logger.info(`[SellerCargoMail] Önizleme kaydedildi: ${preview}`)
}
