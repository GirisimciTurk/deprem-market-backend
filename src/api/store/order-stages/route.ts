import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { aggregateStage, stageLabel } from "../../../lib/order-stage"

/** Tek istekte sorulabilecek en fazla sipariş — liste ekranları 10-20 gösteriyor. */
const MAX_IDS = 50

/**
 * GET /store/order-stages?order_ids=ord_1,ord_2
 *
 * Giriş yapmış müşterinin siparişleri için TOPLU aşama sorgusu. Sipariş listesi
 * ekranları (ör. takip sayfasındaki "Son Siparişleriniz") çekirdek
 * order.fulfillment_status'u gösteriyordu; o alan bu sistemde hiç ilerlemediği
 * için her sipariş "Hazırlanıyor" görünüyordu. Gerçek aşama seller_order'da.
 *
 * Neden /store/seller-shipments'a eklenmedi: o uç TEK sipariş için tam kargo
 * kırılımı (satıcı adı, takip no, kalemler) döndürüyor. Liste ekranı için
 * N istek atmak ya da o ağır yanıtı N kez üretmek gereksiz; burada yalnız
 * sipariş başına tek bir aşama dönüyor.
 *
 * Sahiplik HER sipariş için ayrı doğrulanır; başkasının siparişi sessizce
 * atlanır (varlığını sızdırmamak için 404 yerine yanıttan düşürülür).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Yetkisiz." })

  const raw = (req.query.order_ids as string) || ""
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))]
  if (!ids.length) {
    return res.status(400).json({ message: "order_ids gereklidir." })
  }
  if (ids.length > MAX_IDS) {
    return res.status(400).json({ message: `En fazla ${MAX_IDS} sipariş sorgulanabilir.` })
  }

  const orderModule = req.scope.resolve(Modules.ORDER)
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const stages = await Promise.all(
    ids.map(async (orderId) => {
      const order = await orderModule.retrieveOrder(orderId).catch(() => null)
      if (!order || (order as any).customer_id !== customerId) return null

      const sellerOrders = await marketplace
        .listSellerOrders({ order_id: orderId })
        .catch(() => [])
      const stage = aggregateStage(sellerOrders as any[])
      // Alt-siparişi olmayan (pazaryeri bölünmesi öncesi) sipariş → null.
      // İstemci bu durumda eski çekirdek-durum etiketine düşer.
      if (!stage) return null

      return { order_id: orderId, stage, stage_label: stageLabel(stage) }
    })
  )

  return res.json({ stages: stages.filter(Boolean) })
}
