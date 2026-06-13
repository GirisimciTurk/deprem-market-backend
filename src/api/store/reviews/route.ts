import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { REVIEW_MODULE } from "../../../modules/review"
import ReviewModuleService from "../../../modules/review/service"
import { reviewLimiter, enforceRateLimit } from "../../../lib/rate-limiter"

/**
 * GET /store/reviews?product_handle=...
 * Public — returns only APPROVED reviews for a product.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productHandle = (req.query.product_handle as string) || ""
  if (!productHandle) {
    return res.status(400).json({ message: "product_handle gereklidir." })
  }

  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

  const reviews = await reviewService.listProductReviews(
    { product_handle: productHandle, status: "approved" },
    { order: { created_at: "DESC" } }
  )

  return res.json({ reviews })
}

const createSchema = z.object({
  product_handle: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(2000),
  name: z.string().trim().min(1).max(120),
  images: z.array(z.string()).max(6).optional(),
})

/**
 * POST /store/reviews
 * Creates a PENDING review. Auth is optional: a logged-in customer's id is
 * attached when present, otherwise it is recorded as a guest review.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  if (await enforceRateLimit(reviewLimiter, req, res)) return

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Geçersiz değerlendirme verisi.", issues: parsed.error.issues })
  }
  const { product_handle, rating, comment, name, images } = parsed.data

  // Resolve authoritative product info from the handle (don't trust the client).
  const query = req.scope.resolve("query")
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle"],
    filters: { handle: product_handle },
  })
  const product = products?.[0]
  if (!product) {
    return res.status(404).json({ message: "Ürün bulunamadı." })
  }

  // Giriş yapmış müşterinin e-postasını yakala (yorum yayınlanınca bilgilendirme için).
  const customerId = req.auth_context?.actor_id || null
  let customerEmail: string | null = null
  if (customerId) {
    try {
      const { data: customers } = await query.graph({
        entity: "customer",
        fields: ["email"],
        filters: { id: customerId },
      })
      customerEmail = (customers?.[0] as any)?.email || null
    } catch {
      customerEmail = null
    }
  }

  const reviewService: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)

  const [review] = await reviewService.createProductReviews([
    {
      product_id: product.id,
      product_handle: product.handle,
      product_title: product.title,
      customer_id: customerId,
      customer_name: name,
      customer_email: customerEmail,
      rating,
      comment,
      status: "pending",
      images: (images && images.length ? images : null) as unknown as Record<
        string,
        unknown
      > | null,
    },
  ])

  return res.status(201).json({ review })
}
