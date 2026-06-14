import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { getHakedisDays } from "../../../../../lib/settlement"
import {
  CARRIERS,
  CARRIER_CODES,
  getTrackingUrl,
  DEFAULT_CARRIER,
  isPlatformCarrier,
  CarrierCode,
} from "../../../../../lib/cargo"
import { sendSellerShipmentEmail } from "../../../../../lib/seller-cargo-mail"

const bodySchema = z.object({
  carrier: z.enum(CARRIER_CODES as [CarrierCode, ...CarrierCode[]]).optional(),
  tracking_number: z.string().trim().max(64).optional().nullable(),
  // "Diğer" firmada satıcının elle gireceği takip linki (diğer firmalarda
  // şablondan üretilir, bu alan yok sayılır).
  tracking_url: z.string().trim().url().max(500).optional().nullable(),
})

/**
 * POST /vendors/orders/:id/fulfill  { carrier?, tracking_number? }
 * Satıcı kendi alt-siparişini "kargolandı" olarak işaretler ve (verildiyse)
 * kargo firması + takip numarasını kaydeder; takip linki cargo.ts ile üretilir.
 * Takip numarası girildiyse müşteriye kargo e-postası gönderilir.
 * Sahiplik doğrulanır (başkasının alt-siparişi 404).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz kargo verisi.", issues: parsed.error.issues })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const so = await marketplace.retrieveSellerOrder(req.params.id).catch(() => null)
  if (!so || (so as any).seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Alt-sipariş bulunamadı." })
  }
  if (so.fulfillment_status === "canceled") {
    return res.status(400).json({ message: "İptal edilmiş alt-sipariş kargolanamaz." })
  }

  // Kargo firması: gövdeden gelen > satıcının varsayılanı > sistem varsayılanı.
  const carrier: CarrierCode =
    (parsed.data.carrier as CarrierCode) ||
    ((resolved.seller as any).default_carrier as CarrierCode) ||
    DEFAULT_CARRIER
  const trackingNumber = (parsed.data.tracking_number || "").trim() || null
  // "Diğer" firmada takip linki şablondan üretilemez → satıcının girdiği URL
  // kullanılır. Tanımlı firmalarda link cargo.ts şablonundan üretilir.
  const trackingUrl =
    carrier === "diger"
      ? (parsed.data.tracking_url || "").trim() || null
      : trackingNumber
      ? getTrackingUrl(trackingNumber, carrier)
      : null

  // HİBRİT KARGO: anlaşmalı kargoda (Yurtiçi) platform kargo ücreti hak edişten
  // düşülür; satıcı kendi kargosuyla gönderirse düşülmez (cargo_fee = 0).
  // platform_cargo_fee split anında sabitlenir → firma değişiminde geri yüklenir.
  const cargoFee = isPlatformCarrier(carrier)
    ? Number((so as any).platform_cargo_fee ?? (so as any).cargo_fee ?? 0)
    : 0

  // İdempotent: zaten kargolanmışsa hakediş saatini (fulfilled_at/eligible_at)
  // SIFIRLAMA — yalnız kargo firması/takip bilgisini güncelle. Aksi halde tekrar
  // "kargolandı" basmak ödeme/hakediş tarihini ileri kaydırırdı (ödenmişte bile).
  const alreadyFulfilled = so.fulfillment_status === "fulfilled" && !!(so as any).fulfilled_at
  const now = new Date()
  const patch: Record<string, unknown> = {
    id: so.id,
    fulfillment_status: "fulfilled",
    carrier,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    cargo_fee: cargoFee,
  }
  if (!alreadyFulfilled) {
    patch.fulfilled_at = now
    patch.eligible_at = new Date(now.getTime() + getHakedisDays() * 24 * 60 * 60 * 1000)
  }
  const updated = await marketplace.updateSellerOrders(patch as any)

  // Takip numarası girildiyse müşteriye kargo maili gönder (hata akışı bozmasın).
  if (trackingNumber) {
    try {
      await sendSellerShipmentEmail(
        req.scope,
        { ...(updated as any), carrier, tracking_number: trackingNumber, tracking_url: trackingUrl },
        resolved.seller.name
      )
    } catch (e: any) {
      req.scope.resolve("logger").error(`[fulfill] Kargo maili gönderilemedi: ${e?.message}`)
    }
  }

  return res.json({ order: updated, carriers: CARRIERS })
}
