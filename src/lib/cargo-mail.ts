import { Modules } from "@medusajs/framework/utils"
import { getTrackingUrl, resolveCarrier } from "./cargo"
import { sendMail } from "./mailer"
import { writeEmailPreview } from "./email-preview"

export type CargoStatus = "shipped" | "delivered"

type StatusCopy = {
  subject: (no: string) => string
  heading: string
  emoji: string
  intro: string
  accent: string // başlık rengi
  filePrefix: string
}

const COPY: Record<CargoStatus, StatusCopy> = {
  shipped: {
    subject: (no) => `Siparişiniz Kargoya Verildi! (#${no})`,
    heading: "Siparişiniz Kargoya Verildi!",
    emoji: "🚚",
    intro:
      "Afet hazırlık ekipmanlarınız kargo firmasına başarıyla teslim edilmiştir. Kargo durumunuzu aşağıdaki takip numarasıyla izleyebilirsiniz.",
    accent: "#e11d48",
    filePrefix: "shipped",
  },
  delivered: {
    subject: (no) => `Siparişiniz Teslim Edildi (#${no})`,
    heading: "Siparişiniz Teslim Edildi!",
    emoji: "📦",
    intro:
      "Siparişiniz adresinize başarıyla teslim edilmiştir. Bizi tercih ettiğiniz için teşekkür ederiz. Afete hazır olmanız dileğiyle.",
    accent: "#16a34a",
    filePrefix: "delivered",
  },
}

/**
 * Kargo durumu değiştiğinde (kargoya verildi / teslim edildi) müşteriye e-posta
 * gönderir. SMTP tanımlı değilse `sent-emails/` altına önizleme HTML'i yazar.
 *
 * @param fulfillmentId  shipment.created / delivery.created event'inden gelen data.id
 */
export async function sendCargoStatusEmail(
  container: any,
  fulfillmentId: string,
  status: CargoStatus
) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")

  // Fulfillment id'den order + label + item bilgilerini çöz.
  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: [
      "id",
      "provider_id",
      "labels.tracking_number",
      "labels.tracking_url",
      "order.id",
      "order.email",
      "order.display_id",
      "order.created_at",
      "order.shipping_address.*",
    ],
    filters: { id: fulfillmentId },
  })

  const fulfillment = fulfillments?.[0]
  const order = fulfillment?.order
  if (!order) {
    logger.error(
      `[CargoMail:${status}] Fulfillment için sipariş bulunamadı: ${fulfillmentId}`
    )
    return
  }

  // Sipariş kalemlerini Order Module Service'ten DİREKT oku — query.graph'ın
  // fulfillment→order.items yolu quantity'yi güvenilir döndürmüyordu
  // (mailde "undefinedx ..." çıkıyordu).
  const num = (v: any) => Number(v ?? 0)
  let orderItems: any[] = []
  try {
    const orderModuleService = container.resolve(Modules.ORDER)
    const fullOrder = await orderModuleService.retrieveOrder(order.id, {
      relations: ["items"],
    })
    orderItems = fullOrder.items || []
  } catch (err: any) {
    logger.error(`[CargoMail:${status}] Sipariş kalemleri okunamadı: ${err.message}`)
  }

  const copy = COPY[status]
  const carrierName = resolveCarrier(fulfillment.provider_id).name

  const trackingEntries = (fulfillment.labels || [])
    .filter((l: any) => l?.tracking_number)
    .map((l: any) => ({
      number: l.tracking_number,
      url: l.tracking_url || getTrackingUrl(l.tracking_number, fulfillment.provider_id),
    }))

  const trackingHtml =
    trackingEntries.length > 0
      ? trackingEntries
          .map(
            (t: any) => `
                    <div style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 1px; margin-bottom: 10px;">
                      ${t.number}
                    </div>
                    ${
                      t.url
                        ? `<a href="${t.url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${copy.accent}; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 10px 22px; border-radius: 8px; letter-spacing: 0.5px;">Kargom Nerede? (${carrierName})</a>`
                        : ""
                    }`
          )
          .join(
            `<div style="height: 1px; background: #e2e8f0; margin: 16px 0;"></div>`
          )
      : `<div style="font-size: 16px; font-weight: 700; color: #0f172a;">Kargo takip numarası yakında aktif olacaktır.</div>`

  const itemsHtml = orderItems
    .map(
      (item: any) => `
    <li style="padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; color: #475569;">
      <strong>${num(item.quantity)}x</strong> ${item.title}
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
              <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Sipariş Durum Güncellemesi</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: ${copy.accent};">${copy.emoji} ${copy.heading}</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; text-align: center; margin-bottom: 30px;">${copy.intro}</p>
              <table width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin-bottom: 30px; text-align: center;">
                <tr><td style="font-size: 13px; color: ${copy.accent}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">${carrierName} Takip Numarası</td></tr>
                <tr><td>${trackingHtml}</td></tr>
              </table>
              <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 12px;">Sipariş Ürünleri (#${displayNo})</h3>
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

  // ÖNCE SMTP ile gönder, SONRA önizleme yaz. (sent-emails/ proje içinde
  // olduğundan dosya yazımı dev watcher'ı tetikleyebilir.) Gönderim ortak pooled
  // mailer üzerinden + geçici hatalarda retry ile yapılır.
  const result = await sendMail({
    to: order.email || undefined,
    subject: copy.subject(String(displayNo)),
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[CargoMail:${status}] E-posta gönderildi: ${order.email}`)
  } else if (!result.configured) {
    logger.info(`[CargoMail:${status}] SMTP tanımlı değil; sadece önizleme kaydedildi.`)
  } else {
    logger.error(`[CargoMail:${status}] SMTP gönderimi başarısız (retry sonrası): ${result.error}`)
  }

  // Önizleme dosyası (yerel inceleme için) — proje DIŞINA yazılır (dev watcher tuzağı).
  const preview = writeEmailPreview(`${copy.filePrefix}-${displayNo}.html`, emailHtml)
  if (preview) logger.info(`[CargoMail:${status}] Önizleme kaydedildi: ${preview}`)
}
