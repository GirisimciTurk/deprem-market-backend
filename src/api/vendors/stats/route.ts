import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"

/** GET /vendors/stats — satıcı panosu özet sayıları. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Satıcının ürün sayısı (satıcı→ürün yönünden; product'ı seller ile filtrelemek
  // query.graph'ta desteklenmiyor).
  const { data: sellerRows } = await query.graph({
    entity: "seller",
    fields: ["products.id", "products.status"],
    filters: { id: resolved.seller.id },
  })
  const products = ((sellerRows[0] as any)?.products ?? []) as any[]
  const product_count = products.length
  const pending_product_count = (products as any[]).filter(
    (p) => p.status === "proposed" || p.status === "draft"
  ).length

  // Kargo bekleyen alt-sipariş sayısı.
  const [, pendingCount] = await marketplace.listAndCountSellerOrders(
    { seller_id: resolved.seller.id, fulfillment_status: "pending" },
    { take: 1 }
  )

  // Bu ayki kazanç.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthOrders = await marketplace.listSellerOrders(
    { seller_id: resolved.seller.id, created_at: { $gte: monthStart } },
    { take: 1000 }
  )
  const month_earnings = monthOrders.reduce(
    (s: number, o: any) => s + Number(o.seller_earning ?? 0),
    0
  )

  // Ödenecek bakiye.
  const pendingPayout = await marketplace.listSellerOrders(
    { seller_id: resolved.seller.id, payout_status: "pending" },
    { take: 1000 }
  )
  const pending_balance = pendingPayout.reduce(
    (s: number, o: any) => s + Number(o.seller_earning ?? 0),
    0
  )

  return res.json({
    product_count,
    pending_product_count,
    pending_order_count: pendingCount,
    month_earnings,
    pending_balance,
    currency_code: (monthOrders[0] as any)?.currency_code || "try",
    status: resolved.seller.status,
  })
}
