import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { PUSH_MODULE } from "../../../../modules/push"
import type PushModuleService from "../../../../modules/push/service"

/**
 * POST /store/push/unbind
 * Cihazın push aboneliğini HESAPTAN ÇÖZER (abonelik silinmez).
 *
 * Çıkışta çağrılır: ortak/aile cihazında kullanıcı çıkış yaptıktan sonra o
 * hesabın sipariş ve stok bildirimleri cihaza düşmeye devam etmemeli. Abonelik
 * korunduğu için genel bildirimler (kampanya) çalışmaya devam eder ve kullanıcı
 * tekrar giriş yapınca abonelik yeniden hesabına bağlanır.
 *
 * GİRİŞ GEREKİR ve yalnız ÇAĞIRANIN KENDİ aboneliği çözülebilir: aksi halde
 * endpoint'i ele geçiren biri başkasının bildirimlerini kapatabilirdi. Ortak
 * `/store/push/*` middleware'i misafire izin verdiği için kontrol burada.
 */
const schema = z.object({
  endpoint: z.string().min(1),
})

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = req.auth_context?.actor_id ?? null
  if (!customerId) {
    return res.status(401).json({ message: "Giriş gerekli." })
  }

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "endpoint gerekli." })
  }

  const push = req.scope.resolve<PushModuleService>(PUSH_MODULE)
  const unbound = await push.unbindSubscriptionFromCustomer(
    parsed.data.endpoint,
    customerId
  )

  return res.json({ success: true, unbound })
}
