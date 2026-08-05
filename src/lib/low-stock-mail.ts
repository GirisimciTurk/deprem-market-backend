import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { sendMail } from "./mailer"

const DEFAULT_THRESHOLD = process.env.LOW_STOCK_THRESHOLD
  ? Number(process.env.LOW_STOCK_THRESHOLD)
  : 10

/** Yönetici uyarı adresi: LOW_STOCK_ALERT_EMAIL > SMTP_USER. */
function alertRecipient(): string | undefined {
  return process.env.LOW_STOCK_ALERT_EMAIL || process.env.SMTP_USER || undefined
}

/**
 * Ürünün satıcısının e-postası (pazaryeri ürünlerinde).
 *
 * AYRI ve best-effort: stoğu yöneten satıcının kendisi olduğu için uyarının asıl
 * muhatabı odur, ama bu çözüm başarısız olursa uyarı hiç gitmemeli DEĞİL —
 * yönetici bildirimi eskisi gibi çalışmaya devam etmeli. Bu yüzden kendi
 * try/catch'inde ve hata durumunda null dönüyor.
 */
async function resolveSellerEmail(
  container: any,
  inventoryItemId: string
): Promise<{ email: string; name: string | null } | null> {
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: [
        "variants.product.seller.email",
        "variants.product.seller.name",
      ],
      filters: { id: inventoryItemId },
    })
    const seller = data?.[0]?.variants?.[0]?.product?.seller
    const email = typeof seller?.email === "string" ? seller.email.trim() : ""
    if (!email) return null
    return { email, name: seller?.name ?? null }
  } catch {
    return null
  }
}

/**
 * Bir envanter kaleminin bir lokasyondaki satılabilir stoğu (stoklanan − rezerve) kritik eşiğin
 * altına indiyse yöneticiye uyarı e-postası gönderir. Eşik ürün metadata.critical_threshold'dan,
 * yoksa LOW_STOCK_THRESHOLD env'inden (vars. 10) okunur.
 *
 * `previousAvailable` verilirse yalnız eşiği YENİ geçişte (spam önleme) uyarır.
 * ASLA throw etmez.
 */
export async function maybeAlertLowStock(
  container: any,
  args: { inventoryItemId: string; locationId: string; previousAvailable?: number }
): Promise<void> {
  try {
    const adminTo = alertRecipient()

    const inventory = container.resolve(Modules.INVENTORY)
    const levels = await inventory.listInventoryLevels({
      inventory_item_id: args.inventoryItemId,
      location_id: args.locationId,
    })
    const lvl = levels?.[0]
    if (!lvl) return
    const available = (Number(lvl.stocked_quantity) || 0) - (Number(lvl.reserved_quantity) || 0)

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: ["sku", "variants.title", "variants.product.title", "variants.product.metadata"],
      filters: { id: args.inventoryItemId },
    })
    const item = data?.[0]
    const variant = item?.variants?.[0]
    const product = variant?.product
    const title = product?.title ?? variant?.title ?? item?.sku ?? args.inventoryItemId
    const rawThreshold = product?.metadata?.critical_threshold
    const threshold = Number.isFinite(Number(rawThreshold)) ? Number(rawThreshold) : DEFAULT_THRESHOLD

    if (available > threshold) return
    // Eşik zaten önceden de aşılmışsa (yeni geçiş değilse) tekrar uyarma.
    if (args.previousAvailable != null && args.previousAvailable <= threshold) return

    // Asıl muhatap ürünün SATICISI — stoğu yöneten o. Yönetici de kopyada kalır
    // (önceki davranış). Satıcı e-postası yoksa (ör. mağazanın kendi ürünü) ya da
    // çözülemezse yalnız yöneticiye gider.
    const seller = await resolveSellerEmail(container, args.inventoryItemId)
    const recipients = [...new Set([seller?.email, adminTo].filter(Boolean))] as string[]
    if (recipients.length === 0) return // ne satıcı ne SMTP adresi var → sessiz geç
    const to = recipients.join(", ")

    // Lokasyon adı (best-effort).
    let locationName = args.locationId
    try {
      const { data: locs } = await query.graph({
        entity: "stock_location",
        fields: ["name"],
        filters: { id: args.locationId },
      })
      locationName = locs?.[0]?.name ?? args.locationId
    } catch {
      /* yoksa id kalsın */
    }

    const out = available <= 0
    const subject = out
      ? `⛔ STOK TÜKENDİ: ${title}`
      : `⚠️ Düşük stok uyarısı: ${title} (${available} adet kaldı)`

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <h2 style="color:${out ? "#dc2626" : "#d97706"};margin:0 0 12px">
          ${out ? "Stok Tükendi" : "Düşük Stok Uyarısı"}
        </h2>
        <p style="line-height:1.6">
          <strong>${title}</strong>${item?.sku ? ` (SKU: ${item.sku})` : ""} ürününün
          <strong>${locationName}</strong> lokasyonundaki satılabilir stoğu kritik seviyeye indi.
        </p>
        <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#666">Satılabilir stok</td>
              <td style="font-weight:700;color:${out ? "#dc2626" : "#d97706"}">${available} adet</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Kritik eşik</td>
              <td>${threshold} adet</td></tr>
        </table>
        <p style="line-height:1.6;color:#444">
          Lütfen yeniden stok girişi planlayın.${
            seller
              ? ` Stoğu satıcı panelinizden güncelleyebilirsiniz; ürün stoğa girdiğinde
                 “stoğa gelince haber ver” diyen müşterilere bildirim otomatik gönderilir.`
              : ""
          }
        </p>
        ${
          seller?.name
            ? `<p style="margin-top:16px;font-size:12px;color:#888">Satıcı: ${seller.name}</p>`
            : ""
        }
      </div>`

    const result = await sendMail({ to, subject, html })
    try {
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
      if (result.ok) {
        logger.info(`[low-stock] Uyarı gönderildi: ${title} (${available} adet, eşik ${threshold}) → ${to}`)
      } else if (!result.configured) {
        logger.warn(`[low-stock] SMTP yapılandırılmadığı için uyarı gönderilemedi: ${title}`)
      } else {
        logger.warn(`[low-stock] Uyarı maili başarısız: ${title} — ${result.error}`)
      }
    } catch {
      /* logger yoksa geç */
    }
  } catch {
    /* uyarı maili kritik değil; sessiz geç */
  }
}
