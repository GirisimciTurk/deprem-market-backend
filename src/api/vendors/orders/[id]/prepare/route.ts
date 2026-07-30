import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { sellerOrderStage } from "../../../../../lib/order-stage"

/**
 * POST   /vendors/orders/:id/prepare  → alt-siparişi "Hazırlanıyor" yap
 * DELETE /vendors/orders/:id/prepare  → "Hazırlanıyor" işaretini geri al
 *
 * PARA SAATİNE DOKUNMAZ. Bu uç yalnız `preparing_at` yazar; fulfillment_status,
 * fulfilled_at, eligible_at, cargo_fee, carrier ve tracking_* alanlarına
 * dokunmaz. Hakediş (settlement.ts) `fulfillment_status='fulfilled'` +
 * `eligible_at<=now` arar; "Hazırlanıyor" kaydı `pending` kaldığı için o sorguya
 * hiç girmez → satıcı kargolamadan hakediş süresi işlemeye başlamaz.
 *
 * MÜŞTERİYE MAİL GÖNDERMEZ. Kargo maili tek noktada kalır (fulfill route'u).
 *
 * Yetki: middleware `/vendors/orders/*` yazma metodlarını `orders: full` ile
 * kısıtlar → görüntüleme yetkili çalışan bu ucu çağıramaz (seller-permissions.ts:182).
 */

/** İkisinde de aynı: oturum + sahiplik + iptal kontrolü. */
async function loadOwnSellerOrder(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) {
    res.status(401).json({ message: "Yetkisiz." })
    return null
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const so = await marketplace.retrieveSellerOrder(req.params.id).catch(() => null)
  if (!so || (so as any).seller_id !== resolved.seller.id) {
    res.status(404).json({ message: "Alt-sipariş bulunamadı." })
    return null
  }
  if (so.fulfillment_status === "canceled") {
    res.status(400).json({ message: "İptal edilmiş alt-siparişin aşaması değiştirilemez." })
    return null
  }

  return { marketplace, so }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ctx = await loadOwnSellerOrder(req, res)
  if (!ctx) return
  const { marketplace, so } = ctx

  // Kargolanmış siparişi geriye çekmek bu ucun işi değil — o "Kargolamayı geri al"
  // (DELETE /fulfill) ile yapılır, çünkü hakediş saatinin de geri alınması gerekir.
  if (so.fulfillment_status === "fulfilled") {
    return res.status(400).json({
      message:
        "Kargoya verilmiş sipariş 'Hazırlanıyor'a çekilemez. Önce kargolamayı geri alın.",
    })
  }

  // İdempotent: zaten Hazırlanıyor ise damgayı TAZELEME (aşama tarihi ileri kaymasın).
  if ((so as any).preparing_at) {
    return res.json({ order: so, stage: sellerOrderStage(so as any) })
  }

  const updated = await marketplace.updateSellerOrders({
    id: so.id,
    preparing_at: new Date(),
  } as any)

  return res.json({ order: updated, stage: sellerOrderStage(updated as any) })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const ctx = await loadOwnSellerOrder(req, res)
  if (!ctx) return
  const { marketplace, so } = ctx

  if (so.fulfillment_status === "fulfilled") {
    return res.status(400).json({
      message:
        "Kargoya verilmiş siparişin 'Hazırlanıyor' işareti kaldırılamaz. Önce kargolamayı geri alın.",
    })
  }

  // İdempotent: zaten işaretli değilse sessizce başarılı dön.
  if (!(so as any).preparing_at) {
    return res.json({ order: so, stage: sellerOrderStage(so as any) })
  }

  const updated = await marketplace.updateSellerOrders({
    id: so.id,
    preparing_at: null,
  } as any)

  return res.json({ order: updated, stage: sellerOrderStage(updated as any) })
}
