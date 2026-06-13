import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

/**
 * GET /admin/seller-returns?status=&limit=&offset= — platform genelinde tüm
 * satıcı iadeleri (oversight + hakem). Satıcı adı + sipariş para durumu (iade
 * edilebilir bakiye için) ile zenginleştirilir.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const filters: Record<string, unknown> = {}
  if (status && ["requested", "received", "rejected"].includes(status)) filters.status = status

  const [rows, count] = await marketplace.listAndCountSellerReturns(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  // Satıcı adlarını topluca çek.
  const sellerIds = [...new Set(rows.map((r: any) => r.seller_id).filter(Boolean))]
  const sellers = sellerIds.length
    ? await marketplace.listSellers({ id: sellerIds }, { take: sellerIds.length })
    : []
  const sellerById = new Map(sellers.map((s: any) => [s.id, s]))

  // Sipariş para durumunu (iade edilebilir bakiye) topluca çek.
  const orderIds = [...new Set(rows.map((r: any) => r.order_id).filter(Boolean))]
  const orderById = new Map<string, any>()
  if (orderIds.length) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "summary.*"],
      filters: { id: orderIds } as any,
    })
    for (const o of orders as any[]) orderById.set(o.id, o)
  }

  const returns = rows.map((r: any) => {
    const seller = sellerById.get(r.seller_id)
    const o = orderById.get(r.order_id)
    return {
      ...r,
      seller: seller ? { id: seller.id, name: seller.name, handle: seller.handle } : null,
      order: o
        ? {
            paid_total: o.summary?.paid_total ?? 0,
            refunded_total: o.summary?.refunded_total ?? 0,
          }
        : null,
    }
  })

  return res.json({ returns, count, offset, limit })
}
