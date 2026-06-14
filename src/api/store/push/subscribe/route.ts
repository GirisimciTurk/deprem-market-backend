import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { PUSH_MODULE } from "../../../../modules/push"
import type PushModuleService from "../../../../modules/push/service"

/**
 * POST /store/push/subscribe
 * Tarayıcının PushManager aboneliğini kaydeder. Giriş yapmış müşteride
 * customer_id eklenir (sipariş bildirimleri için), misafirde null kalır.
 */
const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  locale: z.string().optional(),
})

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz abonelik verisi." })
  }
  const { endpoint, keys, locale } = parsed.data
  const customerId = req.auth_context?.actor_id ?? null

  const push = req.scope.resolve<PushModuleService>(PUSH_MODULE)
  await push.upsertSubscription({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    customer_id: customerId,
    user_agent: (req.headers["user-agent"] as string) ?? null,
    locale: locale ?? null,
  })

  return res.json({ success: true })
}
