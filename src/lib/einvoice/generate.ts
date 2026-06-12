import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import MarketplaceModuleService from "../../modules/marketplace/service"
import { INVOICING_MODULE } from "../../modules/invoicing"
import InvoicingModuleService from "../../modules/invoicing/service"
import { getEInvoiceConfig } from "./config"
import { buildInvoiceData, UblParty } from "./ubl-builder"

/**
 * Bir sipariş için satıcı bazında taslak fatura üretir (Trendyol modeli):
 *  - her seller_order için bir "sale" faturası (satıcı → müşteri)
 *  - komisyon > 0 ise bir "commission" faturası (platform → satıcı)
 * İdempotent: aynı (order, seller_order, type) için tekrar üretmez.
 */
export async function generateInvoicesForOrder(container: any, orderId: string): Promise<number> {
  const logger = container.resolve("logger")
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const invoicing: InvoicingModuleService = container.resolve(INVOICING_MODULE)
  const cfg = getEInvoiceConfig()

  const sellerOrders = await marketplace.listSellerOrders({ order_id: orderId }, { take: 100 })
  if (sellerOrders.length === 0) return 0

  // Bu sipariş için zaten üretilmiş faturalar (idempotency).
  const existing = await invoicing.listInvoices({ order_id: orderId }, { take: 500 })
  const seen = new Set(existing.map((i: any) => `${i.seller_order_id}:${i.type}`))

  // Satıcı künyeleri.
  const sellerIds = [...new Set(sellerOrders.map((s: any) => s.seller_id))]
  const sellers = await marketplace.listSellers({ id: sellerIds }, { take: 100 })
  const sellerById = new Map(sellers.map((s: any) => [s.id, s]))

  const rate = cfg.defaultKdvRate
  const toCreate: any[] = []
  const num = (v: any) => Number(v ?? 0)

  for (const so of sellerOrders as any[]) {
    const seller = sellerById.get(so.seller_id) as any
    const addr = (so.shipping_address || {}) as any
    const customerName =
      [addr.first_name, addr.last_name].filter(Boolean).join(" ") ||
      so.customer_email ||
      "Müşteri"

    const customerParty: UblParty = {
      name: customerName,
      email: so.customer_email || undefined,
      address: [addr.address_1, addr.city, addr.postal_code].filter(Boolean).join(", ") || undefined,
    }
    const sellerParty: UblParty = {
      name: seller?.legal_name || seller?.name || "Satıcı",
      taxNumber: seller?.tax_number || undefined,
    }
    const platformParty: UblParty = {
      name: cfg.seller.name,
      taxNumber: cfg.seller.taxNumber,
      taxOffice: cfg.seller.taxOffice,
      address: cfg.seller.address,
    }

    // 1) SATIŞ FATURASI (satıcı → müşteri)
    if (!seen.has(`${so.id}:sale`)) {
      const items = (so.items || []) as any[]
      const built = buildInvoiceData({
        type: "sale",
        profile: "EARSIVFATURA",
        issuer: sellerParty,
        recipient: customerParty,
        lines: items.map((it) => ({
          name: it.variant_title ? `${it.title} (${it.variant_title})` : it.title,
          quantity: num(it.quantity),
          grossUnitPrice: num(it.unit_price),
        })),
        kdvRate: rate,
        currency: so.currency_code || "try",
        issueDate: new Date(),
        draftNumber: `EKYP-S-${so.display_id || "X"}-${so.seller_id.slice(-5)}`,
      })
      toCreate.push({
        type: "sale",
        status: "draft",
        draft_number: built.ubl_payload.DraftNumber,
        issue_date: new Date(),
        issuer_name: sellerParty.name,
        issuer_tax_number: sellerParty.taxNumber || null,
        recipient_name: customerParty.name,
        recipient_tax_number: null,
        recipient_email: customerParty.email || null,
        recipient_address: addr || null,
        order_id: orderId,
        display_id: so.display_id || null,
        seller_order_id: so.id,
        seller_id: so.seller_id,
        currency_code: so.currency_code || "try",
        net_total: built.net_total,
        tax_total: built.tax_total,
        grand_total: built.grand_total,
        tax_rate: rate,
        lines: built.lines,
        ubl_payload: built.ubl_payload,
        provider: cfg.provider,
      })
    }

    // 2) KOMİSYON FATURASI (platform → satıcı), komisyon > 0 ise
    if (num(so.commission_amount) > 0 && !seen.has(`${so.id}:commission`)) {
      const built = buildInvoiceData({
        type: "commission",
        profile: "TICARIFATURA",
        issuer: platformParty,
        recipient: sellerParty,
        lines: [
          {
            name: `Pazar yeri komisyonu (Sipariş #${so.display_id || ""})`,
            quantity: 1,
            grossUnitPrice: num(so.commission_amount),
          },
        ],
        kdvRate: rate,
        currency: so.currency_code || "try",
        issueDate: new Date(),
        draftNumber: `EKYP-K-${so.display_id || "X"}-${so.seller_id.slice(-5)}`,
      })
      toCreate.push({
        type: "commission",
        status: "draft",
        draft_number: built.ubl_payload.DraftNumber,
        issue_date: new Date(),
        issuer_name: platformParty.name,
        issuer_tax_number: platformParty.taxNumber || null,
        recipient_name: sellerParty.name,
        recipient_tax_number: sellerParty.taxNumber || null,
        recipient_email: seller?.email || null,
        recipient_address: null,
        order_id: orderId,
        display_id: so.display_id || null,
        seller_order_id: so.id,
        seller_id: so.seller_id,
        currency_code: so.currency_code || "try",
        net_total: built.net_total,
        tax_total: built.tax_total,
        grand_total: built.grand_total,
        tax_rate: rate,
        lines: built.lines,
        ubl_payload: built.ubl_payload,
        provider: cfg.provider,
      })
    }
  }

  if (toCreate.length === 0) return 0
  await invoicing.createInvoices(toCreate as any)
  logger.info(`[einvoice] Sipariş ${orderId} → ${toCreate.length} taslak fatura üretildi.`)
  return toCreate.length
}
