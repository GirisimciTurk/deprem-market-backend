import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../../_lib/resolve-seller"
import { SERVICE_REQUEST_MODULE } from "../../../../modules/service_request"
import type ServiceRequestModuleService from "../../../../modules/service_request/service"

/**
 * Havuz görünümü: bayiye gösterilirken müşteri iletişim bilgileri (ad/telefon/e-posta/açık
 * adres) MASKELENİR — kazanan seçilene kadar yalnız şehir/ilçe + iş kapsamı görünür.
 * Rakip teklifleri de gizlenir (bayi yalnızca kendi teklifini görür); admin en düşüğü seçer.
 */
function toPoolView(r: any, sellerId: string) {
  const bids: any[] = Array.isArray(r.bids) ? r.bids : []
  const mine = bids.find((b) => b.seller_id === sellerId) || null
  return {
    id: r.id,
    service_title: r.service_title,
    service_kind: r.service_kind,
    product_id: r.product_id,
    city: r.city,
    district: r.district,
    details: r.details,
    preferred_dates: r.preferred_dates,
    note: r.note,
    created_at: r.created_at,
    bid_count: bids.length,
    my_bid: mine
      ? { price: mine.price, note: mine.note ?? "", created_at: mine.created_at }
      : null,
  }
}

/**
 * GET /vendors/service-requests/pool
 * Havuzdaki (atanmamış, teklif bekleyen) hizmet taleplerini döner — bu bayinin teklif
 * verebileceği olanlar. Yalnız aktif bayiler havuzu görür.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (resolved.seller.status !== "active") {
    return res.json({ service_requests: [] })
  }

  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const rows = await svc.listServiceRequests(
    { is_bidding: true, status: "talep" },
    { order: { created_at: "DESC" }, take: 200 }
  )

  const sellerId = resolved.seller.id
  const open = (rows as any[]).filter((r) => {
    if (r.assigned_seller_id) return false
    const rejected = Array.isArray(r.rejected_seller_ids) ? r.rejected_seller_ids : []
    return !rejected.includes(sellerId)
  })

  return res.json({ service_requests: open.map((r) => toPoolView(r, sellerId)) })
}
