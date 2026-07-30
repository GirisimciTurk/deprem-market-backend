import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { buildSellerShipments } from "../../../lib/seller-shipments"

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

  // Aşama türetmesi lib/seller-shipments.ts'te ortak — misafir takip ucu da aynı
  // yardımcıyı kullanır, böylece iki ekran aynı aşamayı söyler.
  const shipments = await buildSellerShipments(req.scope, orderId)

  return res.json({ shipments })
}
