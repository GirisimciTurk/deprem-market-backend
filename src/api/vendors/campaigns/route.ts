import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { getPendingRequiredContracts } from "../../../lib/seller-contracts"
import { createSellerCampaign, campaignLiveStatus } from "../../../lib/seller-campaigns"

/** GET /vendors/campaigns — satıcının kendi kampanyaları (canlı durumlu). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const campaigns = await marketplace.listSellerCampaigns(
    { seller_id: resolved.seller.id },
    { order: { created_at: "DESC" }, take: 200 }
  )

  const now = new Date()
  const items = (campaigns as any[]).map((c) => ({
    ...c,
    live_status: campaignLiveStatus(c, now),
  }))
  // Aktif (yürürlükteki) kampanya rozeti için sayım.
  const active_count = items.filter((c) => c.live_status === "active").length

  return res.json({ campaigns: items, count: items.length, active_count })
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  discount_type: z.enum(["percentage", "fixed"]),
  // percentage: 1-99 (yüzde). fixed: TRY major (kuruşa çevrilir).
  discount_value: z.number().positive(),
  product_ids: z.array(z.string()).min(1),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
})

/**
 * POST /vendors/campaigns — satıcı kendi ürünlerine süreli indirim kampanyası
 * tanımlar. Arkada Medusa price list (type=sale) açılır → storefront gerçek
 * indirimi gösterir, komisyon indirimli fiyattan hesaplanır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (resolved.seller.status !== "active") {
    return res.status(403).json({ message: "Yalnızca onaylı (aktif) satıcılar kampanya açabilir." })
  }
  const pending = await getPendingRequiredContracts(req.scope, resolved.seller.id)
  if (pending.length > 0) {
    return res.status(403).json({
      message: "Kampanya açabilmek için önce satıcı sözleşmelerini onaylamalısınız.",
      pending_contracts: pending.map((c) => ({ id: c.id, title: c.title })),
    })
  }

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz kampanya verisi.", issues: parsed.error.issues })
  }
  const data = parsed.data

  // percentage → tam sayı yüzde; fixed → kuruş.
  const discount_value =
    data.discount_type === "percentage"
      ? Math.round(data.discount_value)
      : Math.round(data.discount_value * 100)

  if (data.discount_type === "percentage" && (discount_value < 1 || discount_value > 99)) {
    return res.status(400).json({ message: "Yüzde indirim 1 ile 99 arasında olmalı." })
  }
  if (data.starts_at && data.ends_at && new Date(data.ends_at) <= new Date(data.starts_at)) {
    return res.status(400).json({ message: "Bitiş tarihi başlangıçtan sonra olmalı." })
  }

  try {
    const campaign = await createSellerCampaign(
      req.scope,
      { id: resolved.seller.id, handle: resolved.seller.handle },
      {
        name: data.name,
        discount_type: data.discount_type,
        discount_value,
        product_ids: data.product_ids,
        starts_at: data.starts_at ?? null,
        ends_at: data.ends_at ?? null,
      }
    )
    return res.status(201).json({ campaign })
  } catch (e: any) {
    return res.status(400).json({ message: e?.message || "Kampanya oluşturulamadı." })
  }
}
