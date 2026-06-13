import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { campaignLiveStatus } from "../../../lib/seller-campaigns"

/**
 * GET /admin/seller-campaigns?status=&q=&limit=&offset=
 * Tüm satıcı kampanyaları (kontrol merkezi gözetimi). status = live_status filtresi
 * (active|scheduled|expired|ended) bellekte uygulanır.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const statusFilter = req.query.status as string | undefined

  const { data } = await query.graph({
    entity: "seller_campaign",
    fields: [
      "id",
      "name",
      "discount_type",
      "discount_value",
      "status",
      "starts_at",
      "ends_at",
      "variant_count",
      "product_ids",
      "price_list_id",
      "created_at",
      "seller.id",
      "seller.name",
      "seller.handle",
    ],
    pagination: { order: { created_at: "DESC" }, take: 1000 },
  })

  const now = new Date()
  let items = (data as any[]).map((c) => ({ ...c, live_status: campaignLiveStatus(c, now) }))
  if (statusFilter) items = items.filter((c) => c.live_status === statusFilter)

  const count = items.length
  const page = items.slice(offset, offset + limit)
  return res.json({ campaigns: page, count, offset, limit })
}
