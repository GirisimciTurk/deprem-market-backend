import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

/**
 * GET /store/seller-shipments?order_id=...
 * Giriş yapmış müşterinin bir siparişine ait satıcı-bazlı kargo bilgilerini döner
 * (her satıcı kendi paketini ayrı kargolar). Sahiplik doğrulanır: sipariş giriş
 * yapan müşteriye ait değilse 404. Çok-satıcılı siparişlerde sipariş detay
 * sayfası her satıcının kargo/takip durumunu bundan okur.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const orderId = (req.query.order_id as string) || ""
  if (!orderId) return res.status(400).json({ message: "order_id gereklidir." })

  const customerId = req.auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Yetkisiz." })

  // Sahiplik doğrula — sipariş bu müşteriye ait mi?
  const orderModule = req.scope.resolve(Modules.ORDER)
  const order = await orderModule.retrieveOrder(orderId).catch(() => null)
  if (!order || (order as any).customer_id !== customerId) {
    return res.status(404).json({ message: "Sipariş bulunamadı." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const sellerOrders = await marketplace.listSellerOrders({ order_id: orderId })

  const shipments = await Promise.all(
    sellerOrders.map(async (so: any) => {
      let sellerName = ""
      let sellerHandle = ""
      try {
        const seller = await marketplace.retrieveSeller(so.seller_id)
        sellerName = (seller as any)?.name || ""
        sellerHandle = (seller as any)?.handle || ""
      } catch {
        // satıcı silinmişse boş geç
      }
      return {
        seller_order_id: so.id,
        seller_name: sellerName,
        seller_handle: sellerHandle,
        fulfillment_status: so.fulfillment_status,
        carrier: so.carrier,
        tracking_number: so.tracking_number,
        tracking_url: so.tracking_url,
        items: so.items,
      }
    })
  )

  return res.json({ shipments })
}
