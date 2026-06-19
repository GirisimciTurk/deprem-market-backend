import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { ANALYTICS_MODULE } from "../../../modules/analytics"
import type AnalyticsModuleService from "../../../modules/analytics/service"
import { trackLimiter, enforceRateLimit } from "../../../lib/rate-limiter"

/**
 * POST /store/track
 * Storefront davranış olayı alımı. Giriş yapmış müşteride `customer_id` otomatik
 * eklenir (istemci gönderemez); misafire de açıktır (session_id ile).
 *
 * GÜVENLİK: `purchase` BURADAN kabul edilmez — yalnız sunucu tarafı (order.placed
 * subscriber) yazar; aksi halde ciro/funnel istemciden uydurulabilirdi. `value`
 * yalnız bilgi amaçlı (ör. sepet tutarı) kabul edilir, ciroya katılmaz.
 */
const CLIENT_EVENTS = [
  "product_view",
  "search",
  "add_to_cart",
  "remove_from_cart",
  "checkout_start",
] as const

const schema = z.object({
  type: z.enum(CLIENT_EVENTS),
  session_id: z.string().trim().min(1).max(64),
  product_id: z.string().max(64).optional().nullable(),
  variant_id: z.string().max(64).optional().nullable(),
  search_query: z.string().trim().max(200).optional().nullable(),
  results_count: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  value: z.coerce.number().int().min(0).optional().nullable(),
  quantity: z.coerce.number().int().min(0).max(10000).optional().nullable(),
  currency_code: z.string().max(8).optional().nullable(),
})

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(trackLimiter, req, res)) return

  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz olay.", issues: parsed.error.issues })
  }
  const d = parsed.data

  const analytics = req.scope.resolve<AnalyticsModuleService>(ANALYTICS_MODULE)
  await analytics.createAnalyticsEvents([
    {
      type: d.type,
      customer_id: req.auth_context?.actor_id || null,
      session_id: d.session_id,
      product_id: d.product_id || null,
      variant_id: d.variant_id || null,
      search_query: d.search_query || null,
      results_count: d.results_count ?? null,
      value: d.value ?? null,
      quantity: d.quantity ?? null,
      currency_code: d.currency_code || null,
    },
  ])

  // Tracker yanıt beklemesin (fire-and-forget) → gövdesiz 204.
  return res.status(204).send()
}
