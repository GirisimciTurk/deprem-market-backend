import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { sendMail } from "../lib/mailer"
import { writeEmailPreview } from "../lib/email-preview"
import { sendOrderPush } from "../lib/order-push"

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

  // order.placed emit edildiği anda query.graph index'i sipariş kalemlerinin
  // quantity'sini ve order.total'i HENÜZ yansıtmaz (unit_price hemen gelir ama
  // quantity undefined, order.total sadece kargo kadar olur → mailde
  // "undefined adet / NaN / 50 TL" çıkıyordu). Bu yüzden Order Module
  // Service'ten DİREKT okur, tutarı güvenilir primitiflerden
  // (unit_price × quantity + kargo) hesaplarız — bu, müşterinin checkout'ta
  // ödediği (vergi dahil) tutarla birebir eşleşir.
  const orderModuleService = container.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, {
      relations: [
        "items",
        "items.adjustments",
        "shipping_methods",
        "shipping_methods.adjustments",
        "shipping_address",
      ],
    })
  } catch (err: any) {
    logger.error(`[OrderPlacedSubscriber] Order not found: ${orderId} (${err.message})`)
    return
  }

  logger.info(`[OrderPlacedSubscriber] Order details fetched. Customer email: ${order.email}`)

  const num = (v: any) => Number(v ?? 0)
  const currency = (order.currency_code || "try").toUpperCase()
  // Kuruş (minor) → "1.750,00" biçimi
  const fmt = (minor: number) =>
    (minor / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Trendyol tarzı dikey ürün listesi: görsel + ad + varyant + adet + satır tutarı
  const items = order.items || []
  const itemsHtml = items
    .map((item: any) => {
      const qty = num(item.quantity)
      const lineTotal = num(item.unit_price) * qty
      const variant =
        item.variant_title && item.variant_title !== item.title ? item.variant_title : ""
      const thumb = item.thumbnail
        ? `<img src="${item.thumbnail}" alt="" width="64" height="64" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;display:block;">`
        : `<div style="width:64px;height:64px;border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0;"></div>`
      return `
      <tr>
        <td valign="top" width="76" style="padding:14px 0;border-bottom:1px solid #f1f5f9;">${thumb}</td>
        <td valign="top" style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:14px;font-weight:600;color:#1e293b;line-height:20px;">${item.title}</div>
          ${variant ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">${variant}</div>` : ""}
          <div style="font-size:13px;color:#64748b;margin-top:6px;">Adet: ${qty}</div>
        </td>
        <td valign="top" style="padding:14px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:15px;font-weight:700;color:#1e293b;white-space:nowrap;">${fmt(lineTotal)} ${currency}</td>
      </tr>`
    })
    .join("")

  // Tutarlar güvenilir primitiflerden hesaplanır (query.graph order.total emit
  // anında lag'liyor + vergiyi farklı hesaplıyor). Bu toplam müşterinin
  // checkout'ta ödediği (vergi dahil) tutarla birebir eşleşir.
  const itemsSubtotal = items.reduce(
    (s: number, it: any) => s + num(it.unit_price) * num(it.quantity),
    0
  )
  const shippingTotal = (order.shipping_methods || []).reduce(
    (s: number, m: any) => s + num(m.amount),
    0
  )
  const discountTotal =
    items.reduce(
      (s: number, it: any) =>
        s + (it.adjustments || []).reduce((a: number, x: any) => a + num(x.amount), 0),
      0
    ) +
    (order.shipping_methods || []).reduce(
      (s: number, m: any) =>
        s + (m.adjustments || []).reduce((a: number, x: any) => a + num(x.amount), 0),
      0
    )
  const grandTotalMinor = itemsSubtotal + shippingTotal - discountTotal

  // Sipariş özeti satırları
  const summaryRow = (label: string, value: string, opts: { strong?: boolean; color?: string } = {}) => `
                <tr>
                  <td style="padding:6px 0;font-size:${opts.strong ? "16px" : "14px"};color:${opts.color || (opts.strong ? "#0f172a" : "#64748b")};font-weight:${opts.strong ? "800" : "500"};">${label}</td>
                  <td style="padding:6px 0;font-size:${opts.strong ? "18px" : "14px"};color:${opts.color || (opts.strong ? "#e11d48" : "#1e293b")};font-weight:${opts.strong ? "800" : "600"};text-align:right;white-space:nowrap;">${value}</td>
                </tr>`
  const summaryHtml =
    summaryRow("Ara Toplam", `${fmt(itemsSubtotal)} ${currency}`) +
    summaryRow("Kargo", shippingTotal === 0 ? "Ücretsiz" : `${fmt(shippingTotal)} ${currency}`) +
    (discountTotal > 0 ? summaryRow("İndirim", `-${fmt(discountTotal)} ${currency}`, { color: "#16a34a" }) : "") +
    `<tr><td colspan="2" style="border-top:2px solid #e2e8f0;padding-top:4px;"></td></tr>` +
    summaryRow("Genel Toplam", `${fmt(grandTotalMinor)} ${currency}`, { strong: true })

  // Custom styled template
  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Siparişiniz Alındı - depremTek Market</title>
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; margin: 40px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 30px; text-align: center; border-bottom: 4px solid #e11d48;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
                DEPREMTEK MARKET
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
              
              <!-- Ürünler (dikey liste) -->
              <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 6px;">
                Ürünler (${items.length})
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 24px;">
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Sipariş Özeti -->
              <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px;">
                Sipariş Özeti
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 18px; margin-bottom: 30px;">
                <tbody>
                  ${summaryHtml}
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
              Bu e-posta <strong>DEV YAPIMCILIK YAYINCILIK SAN. TİC. LTD. ŞTİ.</strong> iştiraki olan depremTek Market tarafından otomatik olarak gönderilmiştir.<br>
              Karşıyaka Mah. 612 Cad. No:50, Gölbaşı/Ankara | bilgi@girisimciturk.com
            </td>
          </tr>
        </table>
      </body>
    </html>
  `

  // Dispatch via SMTP FIRST, then write the preview file. (sent-emails/ lives
  // inside the project, so writing it triggers the dev watcher to restart the
  // server; if written first, the await sendMail below is killed mid-flight and
  // no mail goes out.)
  const result = await sendMail({
    to: order.email || undefined,
    subject: `Siparişiniz Alındı (#${order.display_id || order.id.substring(0, 8)})`,
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[OrderPlacedSubscriber] Live confirmation email sent to: ${order.email}`)
  } else if (!result.configured) {
    logger.info(`[OrderPlacedSubscriber] SMTP credentials not set. Saved visual preview inside sent-emails/.`)
  } else {
    logger.error(`[OrderPlacedSubscriber] SMTP dispatch failed (retry sonrası): ${result.error}`)
  }

  // Web push: giriş yapmış müşteriye "siparişiniz alındı" bildirimi (mailin yanında).
  await sendOrderPush(container, orderId, "placed")

  // Önizleme HTML'i — proje DIŞINA (OS temp) yazılır; aksi halde dev watcher restart olur.
  const preview = writeEmailPreview(`order-${order.display_id || order.id}.html`, emailHtml)
  if (preview) logger.info(`[OrderPlacedSubscriber] Visual email backup saved: ${preview}`)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
