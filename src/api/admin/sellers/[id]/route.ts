import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { inviteSeller } from "../../../../lib/seller-invite"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  legal_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  account_holder: z.string().optional().nullable(),
  default_carrier: z.enum(["yurtici", "mng", "ptt"]).optional().nullable(),
  commission_rate: z.number().min(0).max(100).optional(),
  status: z.enum(["pending", "active", "suspended"]).optional(),
})

const sumField = (arr: any[], k: string) => arr.reduce((s, x) => s + Number(x[k] ?? 0), 0)
const netEarning = (arr: any[]) =>
  arr.reduce(
    (s, x) => s + (Number(x.seller_earning ?? 0) - Number(x.returned_earning ?? 0) - Number(x.cargo_fee ?? 0)),
    0
  )

/**
 * GET /admin/sellers/:id
 * Bir satıcının TÜM yönetim verisi tek çağrıda: profil + ürün/sipariş/değerlendirme/
 * iade özetleri + ödeme (payout) bakiyeleri + ürün listesi + son iadeler.
 * Detaylı satıcı yönetim sayfası bunu kullanır.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerId = req.params.id
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const seller = await marketplace.retrieveSeller(sellerId).catch(() => null)
  if (!seller) return res.status(404).json({ message: "Satıcı bulunamadı." })

  // Ürünler (satıcı→ürün yönünden; product'ı seller ile filtrelemek desteklenmiyor).
  const { data: sellerRows } = await query.graph({
    entity: "seller",
    fields: [
      "products.id",
      "products.title",
      "products.handle",
      "products.status",
      "products.thumbnail",
      "products.created_at",
    ],
    filters: { id: sellerId },
  })
  const products = ((sellerRows[0] as any)?.products ?? []) as any[]
  const productStats = {
    total: products.length,
    published: products.filter((p) => p.status === "published").length,
    proposed: products.filter((p) => p.status === "proposed" || p.status === "draft").length,
    rejected: products.filter((p) => p.status === "rejected").length,
  }

  // Tüm alt-siparişler (özet + payout bakiyeleri).
  const orders = await marketplace.listSellerOrders({ seller_id: sellerId }, { take: 2000 })
  const currency = (orders[0] as any)?.currency_code || "try"
  const fulfilled = orders.filter((o: any) => o.fulfillment_status === "fulfilled")
  const pendingShip = orders.filter((o: any) => o.fulfillment_status === "pending")
  const orderStats = {
    count: orders.length,
    fulfilled_count: fulfilled.length,
    pending_ship_count: pendingShip.length,
    gross: sumField(orders, "subtotal"),
    commission: sumField(orders, "commission_amount"),
    earning_net: netEarning(orders),
  }
  const payout = {
    currency_code: currency,
    pending_balance: netEarning(orders.filter((o: any) => o.payout_status === "pending")),
    eligible_balance: netEarning(orders.filter((o: any) => o.payout_status === "eligible")),
    paid_total: netEarning(orders.filter((o: any) => o.payout_status === "paid")),
    total_returned: sumField(orders, "returned_subtotal"),
    total_cargo_fee: sumField(orders, "cargo_fee"),
  }

  // İadeler.
  const recentReturns = await marketplace.listSellerReturns(
    { seller_id: sellerId },
    { take: 20, order: { created_at: "DESC" } }
  )
  const allReturns = await marketplace.listSellerReturns({ seller_id: sellerId }, { take: 2000 })
  const returnStats = {
    count: allReturns.length,
    requested_count: allReturns.filter((r: any) => r.status === "requested").length,
    returned_subtotal: sumField(allReturns, "returned_subtotal"),
  }

  // Değerlendirme özeti.
  const ratingCount = Number((seller as any).rating_count ?? 0)
  const ratingSum = Number((seller as any).rating_sum ?? 0)
  const [, pendingReviewCount] = await marketplace.listAndCountSellerReviews(
    { seller_id: sellerId, status: "pending" },
    { take: 1 }
  )
  const reviewStats = {
    rating_avg: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    rating_count: ratingCount,
    pending_count: pendingReviewCount,
  }

  // Satıcının panel girişi var mı? (SellerAdmin kaydı = giriş kimliği bağlı.)
  const [, adminCount] = await marketplace.listAndCountSellerAdmins({ seller_id: sellerId }, { take: 1 })
  const hasLogin = adminCount > 0

  return res.json({
    seller,
    has_login: hasLogin,
    product_stats: productStats,
    order_stats: orderStats,
    payout,
    return_stats: returnStats,
    review_stats: reviewStats,
    products,
    recent_returns: recentReturns,
  })
}

/** POST /admin/sellers/:id — satıcıyı güncelle (onay/askıya alma/komisyon vb.). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const existing = await service.retrieveSeller(req.params.id).catch(() => null)
  if (!existing) return res.status(404).json({ message: "Satıcı bulunamadı." })

  const seller = await service.updateSellers({ id: req.params.id, ...parsed.data })

  // Onayda (pending → active) satıcının HENÜZ giriş kimliği yoksa otomatik davet:
  // emailpass kimliği + geçici şifre e-postası. Self-service kaydolanlarda zaten
  // SellerAdmin vardır → atlanır (mevcut şifreleri korunur).
  let invited = false
  if (
    parsed.data.status === "active" &&
    (existing as any).status !== "active" &&
    !(existing as any).is_house &&
    (seller as any).email
  ) {
    const admins = await service.listSellerAdmins({ seller_id: req.params.id })
    if (admins.length === 0) {
      const result = await inviteSeller(req.scope, req.params.id)
      invited = result.ok
    }
  }

  return res.json({ seller, invited })
}

/** DELETE /admin/sellers/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  await service.deleteSellers(req.params.id)
  return res.json({ id: req.params.id, object: "seller", deleted: true })
}
