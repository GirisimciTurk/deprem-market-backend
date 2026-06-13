import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { reviewLimiter, enforceRateLimit } from "../../../lib/rate-limiter"
import { sendQuestionAskedEmail } from "../../../lib/qa-mail"
import { notifySeller } from "../../../lib/notify"

/**
 * GET /store/product-questions?product_id=... (veya product_handle=)
 * Public — ürünün YANITLANMIŞ (answered) sorularını döndürür (Soru & Cevap).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = (req.query.product_id as string) || ""
  const productHandle = (req.query.product_handle as string) || ""
  if (!productId && !productHandle) {
    return res.status(400).json({ message: "product_id veya product_handle gereklidir." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const filters: Record<string, unknown> = { status: "answered" }
  if (productId) filters.product_id = productId
  else filters.product_handle = productHandle

  const questions = await marketplace.listProductQuestions(filters, {
    order: { answered_at: "DESC" },
    take: 100,
  })

  // Yalnız herkese açık alanları döndür (müşteri kimliği/e-postası gizli).
  const publicQuestions = (questions as any[]).map((q) => ({
    id: q.id,
    customer_name: q.customer_name,
    question: q.question,
    answer: q.answer,
    answered_at: q.answered_at,
    created_at: q.created_at,
  }))

  return res.json({ questions: publicQuestions })
}

const createSchema = z.object({
  product_id: z.string().min(1).optional(),
  product_handle: z.string().min(1).optional(),
  question: z.string().trim().min(5).max(1000),
  name: z.string().trim().min(1).max(120),
})

/**
 * POST /store/product-questions — ürün sorusu oluşturur (pending). Auth opsiyonel.
 * Sorunun yönlendirileceği satıcı, ürünün seller-product link'inden bulunur ve
 * satıcıya "yeni soru" e-postası gönderilir.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(reviewLimiter, req, res)) return

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz soru.", issues: parsed.error.issues })
  }
  const { product_id, product_handle, question, name } = parsed.data
  if (!product_id && !product_handle) {
    return res.status(400).json({ message: "product_id veya product_handle gereklidir." })
  }

  const query = req.scope.resolve("query")
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "seller.id", "seller.name", "seller.email"],
    filters: product_id ? { id: product_id } : { handle: product_handle },
  })
  const product = products?.[0] as any
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })
  if (!product.seller?.id) {
    return res.status(400).json({ message: "Bu ürünün satıcısı bulunamadı." })
  }

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

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const createdRes = (await marketplace.createProductQuestions([
    {
      product_id: product.id,
      product_handle: product.handle,
      product_title: product.title,
      seller_id: product.seller.id,
      customer_id: customerId,
      customer_name: name,
      customer_email: customerEmail,
      question,
      status: "pending",
    },
  ] as any)) as unknown
  const created = (Array.isArray(createdRes) ? createdRes[0] : createdRes) as any

  // Satıcıya "yeni soru" bildirimi (best-effort): e-posta + panel-içi bildirim.
  try {
    await sendQuestionAskedEmail(req.scope, {
      seller_email: product.seller.email,
      seller_name: product.seller.name,
      product_title: product.title,
      question,
    })
  } catch {
    /* best-effort */
  }
  await notifySeller(req.scope, product.seller.id, {
    type: "question",
    title: "Ürününüze yeni bir soru soruldu",
    body: `${product.title}: "${question.slice(0, 120)}"`,
    link: "/sorular",
  })

  return res.status(201).json({ question: { id: created.id, status: created.status } })
}
