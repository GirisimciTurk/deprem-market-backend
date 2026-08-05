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
  LOCK_PLATFORM_CARRIER,
  isPlatformCarrier,
  CarrierCode,
} from "../../../../../lib/cargo"
import { sendSellerShipmentEmail } from "../../../../../lib/seller-cargo-mail"
import { errorMessage } from "../../../../../lib/errors"

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
  // ŞİMDİLİK KİLİT (LOCK_PLATFORM_CARRIER): firma seçimi kapalıyken gövdede ne
  // gelirse gelsin anlaşmalı kargoya (Yurtiçi) sabitlenir — herkes anlaşmalı
  // platformla gönderir, kargo ücreti hak edişten düşülür (isPlatformCarrier).
  const carrier: CarrierCode = LOCK_PLATFORM_CARRIER
    ? DEFAULT_CARRIER
    : (parsed.data.carrier as CarrierCode) ||
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
  // platform_cargo_fee 0 olabilir (migration öncesi siparişler hiç yazmamış) →
  // `??` 0'ı geçerli sayıp eski cargo_fee'yi (split anında yazılan desi ücreti)
  // SIFIRLARDI. platform_cargo_fee>0 ise onu, değilse mevcut cargo_fee'yi kullan.
  const platformFee = Number((so as any).platform_cargo_fee ?? 0)
  const existingFee = Number((so as any).cargo_fee ?? 0)
  const cargoFee = isPlatformCarrier(carrier)
    ? (platformFee > 0 ? platformFee : existingFee)
    : 0

  // İdempotent: zaten kargolanmışsa hakediş saatini (fulfilled_at/eligible_at)
  // SIFIRLAMA — yalnız kargo firması/takip bilgisini güncelle. Aksi halde tekrar
  // "kargolandı" basmak ödeme/hakediş tarihini ileri kaydırırdı (ödenmişte bile).
  const alreadyFulfilled = so.fulfillment_status === "fulfilled" && !!(so as any).fulfilled_at
  const previousTracking = ((so as any).tracking_number || "").trim() || null
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

  // Müşteriye kargo maili. İKİ DÜZELTME:
  //  1) Eskiden yalnız `if (trackingNumber)` idi → satıcı takip numarası girmeden
  //     kargolarsa müşteri HİÇBİR ŞEY duymuyordu. Artık ilk kargolamada takip no
  //     olmasa da gidiyor (şablon takip no bloğunu kaldırabiliyor).
  //  2) Eskiden takip numarasını düzeltmek için tekrar POST atınca müşteriye
  //     İKİNCİ "Kargoya Verildi" maili gidiyordu. Artık yalnız ilk kargolamada
  //     ya da takip numarası GERÇEKTEN değiştiyse gönderilir; aynı veriyle
  //     tekrar basmak mail üretmez.
  const trackingChanged = previousTracking !== trackingNumber
  const shouldSendShipmentEmail = !alreadyFulfilled || trackingChanged
  if (shouldSendShipmentEmail) {
    try {
      await sendSellerShipmentEmail(
        req.scope,
        { ...(updated as any), carrier, tracking_number: trackingNumber, tracking_url: trackingUrl },
        resolved.seller.name
      )
    } catch (e) {
      req.scope.resolve("logger").error(`[fulfill] Kargo maili gönderilemedi: ${errorMessage(e)}`)
    }
  }

  return res.json({ order: updated, carriers: CARRIERS })
}

/**
 * Satıcının "Kargoya Verildi" işaretini geri alabileceği süre (saat).
 * 0 = geri alma tamamen kapalı.
 */
function getUnshipWindowHours(): number {
  const raw = Number(process.env.UNSHIP_WINDOW_HOURS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 24
}

/**
 * DELETE /vendors/orders/:id/fulfill → "Kargoya Verildi"yi geri al.
 *
 * Yanlış basılan kargolamayı düzeltmek için. NEDEN SÖMÜRÜLEMEZ: geri alıp tekrar
 * kargolamak `fulfilled_at`'i DAHA İLERİ bir tarihe yazar → `eligible_at` gecikir
 * ve seller-scorecard'daki zamanında-kargolama oranı düşer. Yani işlem yalnız
 * satıcının kendi aleyhine çalışır; hakedişi öne çekmek için kullanılamaz.
 *
 * Üç sert kapı: ödeme yapılmamış olmalı, kargolamadan bu yana pencere aşılmamış
 * olmalı, ve alt-sipariş gerçekten kargolanmış olmalı.
 *
 * Müşteriye mail GÖNDERMEZ — "kargonuz geri alındı" bildirimi kafa karıştırır;
 * satıcı zaten hemen ardından doğru bilgiyle tekrar kargolayacak.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const so = await marketplace.retrieveSellerOrder(req.params.id).catch(() => null)
  if (!so || (so as any).seller_id !== resolved.seller.id) {
    return res.status(404).json({ message: "Alt-sipariş bulunamadı." })
  }

  if (so.fulfillment_status !== "fulfilled") {
    return res.status(400).json({ message: "Bu alt-sipariş kargoya verilmemiş." })
  }

  // Para çıktıysa aşama geri alınamaz — hakediş/transfer zinciri zaten işlemiş.
  if ((so as any).payout_status !== "pending") {
    return res.status(400).json({
      message: "Ödemesi işleme girmiş siparişin kargolaması geri alınamaz. Destek ile görüşün.",
    })
  }

  const windowHours = getUnshipWindowHours()
  if (windowHours === 0) {
    return res.status(400).json({ message: "Kargolamayı geri alma kapalı." })
  }
  const fulfilledAt = (so as any).fulfilled_at ? new Date((so as any).fulfilled_at) : null
  if (fulfilledAt) {
    const elapsedHours = (Date.now() - fulfilledAt.getTime()) / (60 * 60 * 1000)
    if (elapsedHours > windowHours) {
      return res.status(400).json({
        message: `Kargolamayı geri alma süresi doldu (${windowHours} saat). Destek ile görüşün.`,
      })
    }
  }

  // fulfilled_at ve eligible_at TEMİZLENİR: aksi halde kargolanmamış bir sipariş
  // hakediş saatini işletmeye devam ederdi. cargo_fee de sıfırlanmaz —
  // tekrar kargolandığında carrier'a göre yeniden hesaplanıyor.
  const updated = await marketplace.updateSellerOrders({
    id: so.id,
    fulfillment_status: "pending",
    fulfilled_at: null,
    eligible_at: null,
  } as any)

  return res.json({ order: updated, carriers: CARRIERS })
}
