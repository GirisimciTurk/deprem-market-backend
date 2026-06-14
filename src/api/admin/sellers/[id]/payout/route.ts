import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { getPayTRConfig } from "../../../../../lib/paytr-config"
import { submitPlatformTransfer } from "../../../../../lib/paytr-transfer"

const schema = z.object({
  // Belirli alt-siparişler; verilmezse satıcının TÜM hakedişli ödemeleri işlenir.
  order_ids: z.array(z.string()).optional(),
})

/** Bir alt-siparişin net ödenecek tutarı (kuruş): kazanç − iade − kargo, alt sınır 0. */
function netPayout(o: any): number {
  return Math.max(
    0,
    Number(o.seller_earning ?? 0) -
      Number(o.returned_earning ?? 0) -
      Number(o.cargo_fee ?? 0)
  )
}

/**
 * POST /admin/sellers/:id/payout  { order_ids?: string[] }
 * Satıcının HAKEDİŞ ETMİŞ (eligible) alt-siparişlerini öder.
 *
 * PayTR yapılandırılmışsa: her alt-sipariş için PayTR koruma hesabından (escrow)
 * satıcının IBAN'ına "platform transfer" talimatı verilir; başarılı olursa
 * "paid" işaretlenir ve trans_id saklanır. Başarısız transferler "eligible"
 * kalır (tekrar denenebilir / geri-dönen transfer akışı).
 * PayTR yoksa: eski manuel mod — kayıtlar "paid" işaretlenir (banka transferi
 * sistem dışında yapılır).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const logger = req.scope.resolve("logger")
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const filters: Record<string, unknown> = {
    seller_id: sellerId,
    payout_status: "eligible",
    fulfillment_status: { $ne: "canceled" },
  }
  if (parsed.data.order_ids?.length) filters.id = parsed.data.order_ids

  const eligible = await marketplace.listSellerOrders(filters, { take: 1000 })
  if (eligible.length === 0) {
    return res.json({
      paid_count: 0,
      paid_amount: 0,
      message: "Hakediş etmiş (ödenebilir) kayıt yok.",
    })
  }

  const cfg = getPayTRConfig()
  const paidAt = new Date()

  // ── Manuel mod (PayTR yapılandırılmamış): eski davranış — hepsini paid yap. ──
  if (!cfg.configured) {
    await marketplace.updateSellerOrders(
      eligible.map((o: any) => ({ id: o.id, payout_status: "paid", paid_at: paidAt })) as any
    )
    const paid_amount = eligible.reduce((s: number, o: any) => s + netPayout(o), 0)
    return res.json({
      paid_count: eligible.length,
      paid_amount,
      mode: "manual",
      message: "PayTR yapılandırılmamış — manuel (banka) ödeme olarak işaretlendi.",
    })
  }

  // ── PayTR modu: escrow'dan satıcı IBAN'ına platform transfer. ──
  const seller: any = await marketplace.retrieveSeller(sellerId).catch(() => null)
  const transferName = seller?.account_holder || seller?.name || ""
  const transferIban = seller?.iban || ""
  if (!transferIban || !transferName) {
    return res.status(400).json({
      message:
        "Satıcının IBAN/hesap sahibi bilgisi eksik — PayTR transferi yapılamaz.",
    })
  }

  // İlgili siparişlerin toplam tutarı + PayTR merchant_oid'i (callback'te yazılır).
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const orderIds = [...new Set(eligible.map((o: any) => o.order_id))]
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "total", "metadata"],
    filters: { id: orderIds },
  })
  const orderMap = new Map<string, { total: number; merchantOid?: string }>()
  for (const o of orders as any[]) {
    orderMap.set(o.id, {
      total: Math.round(Number(o.total ?? 0)),
      merchantOid: (o.metadata as any)?.paytr_merchant_oid,
    })
  }

  const paid: any[] = []
  const errors: { id: string; reason: string }[] = []
  let paid_amount = 0

  for (const so of eligible as any[]) {
    const net = netPayout(so)
    // Transfer edilecek tutar yoksa (tam iade vb.) doğrudan paid.
    if (net <= 0) {
      paid.push({ id: so.id, payout_status: "paid", paid_at: paidAt })
      continue
    }
    const info = orderMap.get(so.order_id)
    if (!info?.merchantOid) {
      errors.push({ id: so.id, reason: "Siparişte PayTR merchant_oid yok (PayTR ile ödenmemiş olabilir)." })
      continue
    }

    const result = await submitPlatformTransfer({
      merchantOid: info.merchantOid,
      transId: String(so.id).replace(/[^a-zA-Z0-9]/g, ""),
      submerchantAmount: net,
      totalAmount: info.total || net,
      transferName,
      transferIban,
    })

    if (result.status === "success") {
      paid.push({
        id: so.id,
        payout_status: "paid",
        paid_at: paidAt,
        payout_trans_id: result.trans_id,
      })
      paid_amount += net
    } else {
      logger.error(`PayTR payout: transfer başarısız (${so.id}): ${result.reason}`)
      errors.push({ id: so.id, reason: result.reason || "Transfer başarısız." })
    }
  }

  if (paid.length) {
    await marketplace.updateSellerOrders(paid as any)
  }

  return res.json({
    paid_count: paid.length,
    paid_amount,
    mode: "paytr",
    error_count: errors.length,
    errors,
    message: errors.length
      ? `${paid.length} transfer başarılı, ${errors.length} başarısız (eligible kaldı).`
      : `${paid.length} satıcı ödemesi PayTR ile aktarıldı.`,
  })
}
