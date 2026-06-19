import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendMail } from "../lib/mailer"
import { sendToCustomer } from "../lib/web-push"

/**
 * Terk edilmiş sepet kurtarma (saatlik). Tamamlanmamış (completed_at NULL), e-postası
 * olan, son N saattir dokunulmamış ama M günden eski olmayan sepetleri bulur; bir kez
 * hatırlatma maili (+ üyeyse web push) gönderir. Tekrar göndermemek için
 * cart.metadata.recovery_sent_at damgalanır.
 *
 * Eşikler env ile ayarlanır: ABANDON_AFTER_HOURS (vars. 4), ABANDON_MAX_DAYS (vars. 7).
 */
const HOURS = Number(process.env.ABANDON_AFTER_HOURS || 4)
const MAX_DAYS = Number(process.env.ABANDON_MAX_DAYS || 7)
const STOREFRONT_URL = (process.env.STOREFRONT_URL || "https://depremtek.market").replace(/\/$/, "")

const fmt = (minor: number) =>
  (Number(minor) / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function recoveryEmail(p: {
  title: string | null
  thumb: string | null
  itemCount: number
  total: string
  currency: string
  url: string
}): string {
  const thumb = p.thumb
    ? `<img src="${p.thumb}" width="72" height="72" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;">`
    : `<div style="width:72px;height:72px;border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0;"></div>`
  return `
  <!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f8fafc;margin:0;padding:0;color:#1e293b;">
    <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;margin:40px auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:26px 30px;text-align:center;border-bottom:4px solid #e11d48;">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;text-transform:uppercase;">EKYP DEPREM MARKET</h1>
      </td></tr>
      <tr><td style="padding:34px 30px;">
        <h2 style="font-size:20px;margin:0 0 10px;color:#0f172a;">Sepetinizi unutmuş olabilir misiniz? 🛒</h2>
        <p style="font-size:15px;line-height:24px;color:#475569;margin:0 0 24px;">
          Sepetinizde <strong>${p.itemCount}</strong> ürün sizi bekliyor. Stoklar tükenmeden siparişinizi tamamlayın.
        </p>
        <table width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td width="88" style="padding:14px;">${thumb}</td>
            <td style="padding:14px 14px 14px 0;">
              <div style="font-size:14px;font-weight:600;color:#1e293b;">${p.title || "Sepetinizdeki ürünler"}</div>
              <div style="font-size:13px;color:#64748b;margin-top:4px;">Toplam: <strong>${p.total} ${p.currency}</strong></div>
            </td>
          </tr>
        </table>
        <div style="text-align:center;margin:8px 0 4px;">
          <a href="${p.url}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;">Sepete Dön</a>
        </div>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:22px 30px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
        Bu e-posta EKYP Deprem Market tarafından otomatik gönderilmiştir.
      </td></tr>
    </table>
  </body></html>`
}

export default async function recoverAbandonedCartsJob(container: MedusaContainer) {
  const logger = container.resolve("logger")
  const knex: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const now = Date.now()
  const after = new Date(now - HOURS * 3600 * 1000)
  const maxAge = new Date(now - MAX_DAYS * 86400 * 1000)

  const carts: any[] = await knex
    .raw(
      `select c.id, c.email, c.customer_id, c.currency_code,
              count(li.id) as item_count,
              coalesce(sum(li.unit_price * li.quantity),0) as total,
              (array_agg(li.product_title order by li.created_at))[1] as sample_title,
              (array_agg(li.thumbnail      order by li.created_at))[1] as sample_thumb
       from cart c
       join cart_line_item li on li.cart_id = c.id and li.deleted_at is null
       where c.deleted_at is null and c.completed_at is null and c.email is not null
         and c.updated_at <= ? and c.updated_at >= ?
         and (c.metadata->>'recovery_sent_at') is null
       group by c.id
       having count(li.id) > 0
       order by c.updated_at desc
       limit 100`,
      [after, maxAge]
    )
    .then((r: any) => r.rows as any[])

  if (!carts.length) return

  let mailed = 0
  let pushed = 0
  for (const cart of carts) {
    const currency = (cart.currency_code || "try").toUpperCase()
    const html = recoveryEmail({
      title: cart.sample_title,
      thumb: cart.sample_thumb,
      itemCount: Number(cart.item_count),
      total: fmt(cart.total),
      currency,
      url: `${STOREFRONT_URL}/tr/cart`,
    })

    try {
      const r = await sendMail({
        to: cart.email,
        subject: "Sepetinizde ürünler sizi bekliyor 🛒",
        html,
      })
      if (r.ok) mailed++
    } catch (e: any) {
      logger.warn(`[recover-carts] mail ${cart.id}: ${e?.message}`)
    }

    if (cart.customer_id) {
      try {
        const sent = await sendToCustomer(container, cart.customer_id, {
          title: "Sepetiniz sizi bekliyor 🛒",
          body: `${cart.item_count} ürün sepetinizde duruyor. Tamamlamak ister misiniz?`,
          url: "/tr/cart",
          tag: `cart-recovery-${cart.id}`,
        })
        if (sent > 0) pushed++
      } catch (e: any) {
        logger.warn(`[recover-carts] push ${cart.id}: ${e?.message}`)
      }
    }

    // Tekrar hatırlatmayı önle (jsonb merge).
    await knex.raw(
      `update cart set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('recovery_sent_at', ?::text)
       where id = ?`,
      [new Date(now).toISOString(), cart.id]
    )
  }

  logger.info(`[recover-carts] ${carts.length} terk sepet işlendi · ${mailed} mail · ${pushed} push`)
}

export const config = {
  name: "recover-abandoned-carts",
  schedule: "0 * * * *",
}
