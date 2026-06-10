import fs from "fs"
import path from "path"
import { Modules } from "@medusajs/framework/utils"
import { sendMail } from "./mailer"

/**
 * Sipariş iptal edildiğinde müşteriye "Siparişiniz İptal Edildi" e-postası gönderir.
 * Otomatik iade yapıldıysa iade tutarını da belirtir. cargo-mail/return-mail deseniyle:
 * pooled mailer + retry, SMTP yoksa sent-emails/ altına önizleme.
 *
 * @param refundedMinor  Otomatik iade edilen tutar (minor unit/kuruş); 0 ise iade yok/gerekmedi.
 */
export async function sendOrderCanceledEmail(
  container: any,
  orderId: string,
  refundedMinor: number,
  currencyCode: string
) {
  const logger = container.resolve("logger")
  const orderModule = container.resolve(Modules.ORDER)

  let order: any
  try {
    // retrieveOrder quantity/unit_price'ı güvenilir verir (bkz. cargo-mail notu).
    order = await orderModule.retrieveOrder(orderId, { relations: ["items"] })
  } catch (err: any) {
    logger.error(`[OrderCanceledMail] Sipariş okunamadı: ${err.message}`)
    return
  }

  const num = (v: any) => Number(v ?? 0)
  const items = order.items || []
  const displayNo = order.display_id || order.id.substring(0, 8)
  const cur = (currencyCode || order.currency_code || "try").toUpperCase()
  const refundedTL = (num(refundedMinor) / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
  })

  const refundLine =
    num(refundedMinor) > 0
      ? `<strong>${refundedTL} ${cur}</strong> tutarındaki ödemeniz kartınıza iade edilmiştir; bankanıza bağlı olarak birkaç iş günü içinde hesabınıza yansır.`
      : `Bu sipariş için tahsilat yapılmadığından ücret iadesi gerekmemiştir.`

  const itemsHtml = items
    .map(
      (i: any) => `
    <li style="padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; color: #475569;">
      <strong>${num(i.quantity)}x</strong> ${i.title}
    </li>`
    )
    .join("")

  const accent = "#dc2626"
  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Siparişiniz İptal Edildi - EKYP Deprem Market</title></head>
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
              <h2 style="font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 15px; text-align: center; color: ${accent};">❌ Siparişiniz İptal Edildi</h2>
              <p style="font-size: 15px; line-height: 24px; color: #475569; text-align: center; margin-bottom: 12px;">
                <strong>#${displayNo}</strong> numaralı siparişiniz iptal edilmiştir.
              </p>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 0 0 28px; font-size: 14px; color: #475569; line-height: 22px; text-align: center;">
                ${refundLine}
              </div>
              <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 12px;">İptal Edilen Ürünler (#${displayNo})</h3>
              <ul style="list-style-type: none; padding-left: 0; margin-top: 0; margin-bottom: 30px;">${itemsHtml || '<li style="font-size:14px;color:#475569;">—</li>'}</ul>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 15px; font-size: 13px; color: #475569; line-height: 20px; text-align: center;">
                Soru veya yeni siparişleriniz için bizimle <strong>bilgi@girisimciturk.com</strong> üzerinden iletişime geçebilirsiniz.
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
    to: order.email || undefined,
    subject: `Siparişiniz İptal Edildi (#${displayNo})`,
    html: emailHtml,
  })
  if (result.ok) {
    logger.info(`[OrderCanceledMail] E-posta gönderildi: ${order.email}`)
  } else if (!result.configured) {
    logger.info(`[OrderCanceledMail] SMTP tanımlı değil; sadece önizleme kaydedildi.`)
  } else {
    logger.error(`[OrderCanceledMail] SMTP gönderimi başarısız (retry sonrası): ${result.error}`)
  }

  try {
    const dir = path.join(process.cwd(), "sent-emails")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, `canceled-${displayNo}.html`), emailHtml)
    logger.info(`[OrderCanceledMail] Önizleme kaydedildi: canceled-${displayNo}.html`)
  } catch (err: any) {
    logger.error(`[OrderCanceledMail] Önizleme yazılamadı: ${err.message}`)
  }
}
