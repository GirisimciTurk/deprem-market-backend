import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { PUSH_MODULE } from "../../../../modules/push"
import type PushModuleService from "../../../../modules/push/service"

/**
 * POST /store/push/unsubscribe
 * Tarayıcı aboneliğini siler (kullanıcı bildirimleri kapattığında).
 */
const schema = z.object({
  endpoint: z.string().min(1),
})

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "endpoint gerekli." })
  }
  const push = req.scope.resolve<PushModuleService>(PUSH_MODULE)
  const removed = await push.deleteSubscriptionByEndpoint(parsed.data.endpoint)
  return res.json({ success: true, removed })
}
