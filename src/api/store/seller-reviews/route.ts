import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { reviewLimiter, enforceRateLimit } from "../../../lib/rate-limiter"
import { sellerRatingAvg } from "../../../lib/seller-rating"
import { notifySeller } from "../../../lib/notify"

/**
 * GET /store/seller-reviews?seller_handle=...
 * Herkese açık — bir satıcının YALNIZ onaylı (approved) değerlendirmelerini +
 * özet (ortalama puan, sayı) döndürür.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const sellerHandle = (req.query.seller_handle as string) || ""
  if (!sellerHandle) {
    return res.status(400).json({ message: "seller_handle gereklidir." })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "rating_sum", "rating_count"],
    filters: { handle: sellerHandle } as any,
  })
  const seller = sellers?.[0] as any
  if (!seller) {
    return res.status(404).json({ message: "Satıcı bulunamadı." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const reviews = await marketplace.listSellerReviews(
    { seller_id: seller.id, status: "approved" },
    { order: { created_at: "DESC" } }
  )

  return res.json({
    reviews,
    rating_avg: sellerRatingAvg(seller.rating_sum, seller.rating_count),
    rating_count: seller.rating_count ?? 0,
  })
}

const createSchema = z.object({
  seller_handle: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(2000),
  name: z.string().trim().min(1).max(120),
  order_id: z.string().optional().nullable(),
})

/**
 * POST /store/seller-reviews
 * `pending` durumunda bir satıcı değerlendirmesi oluşturur. Giriş yapmış
 * müşterinin id'si eklenir; misafir gönderimine de izin verilir (ürün
 * yorumlarıyla aynı politika).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(reviewLimiter, req, res)) return

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Geçersiz değerlendirme verisi.", issues: parsed.error.issues })
  }
  const { seller_handle, rating, comment, name, order_id } = parsed.data

  // Satıcıyı handle'dan sunucuda çöz (istemciye güvenme).
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "status"],
    filters: { handle: seller_handle } as any,
  })
  const seller = sellers?.[0] as any
  if (!seller || seller.status !== "active") {
    return res.status(404).json({ message: "Satıcı bulunamadı." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [review] = await marketplace.createSellerReviews([
    {
      seller_id: seller.id,
      order_id: order_id || null,
      customer_id: req.auth_context?.actor_id || null,
      customer_name: name,
      rating,
      comment,
      status: "pending",
    },
  ])

  // Satıcıya "yeni değerlendirme" panel-içi bildirimi (onay öncesi haberdar olsun).
  await notifySeller(req.scope, seller.id, {
    type: "review",
    title: `Yeni değerlendirme (${rating}★)`,
    body: comment ? String(comment).slice(0, 120) : "Mağazanıza yeni bir değerlendirme yapıldı.",
    link: "/reviews",
  })

  return res.status(201).json({ review })
}
