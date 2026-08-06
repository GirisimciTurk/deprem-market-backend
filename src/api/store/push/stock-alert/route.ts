import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { PUSH_MODULE } from "../../../../modules/push"
import type PushModuleService from "../../../../modules/push/service"

/**
 * POST /store/push/stock-alert
 * "Stoğa gelince haber ver" kaydı. İstemci önce push aboneliği oluşturur,
 * ardından aynı endpoint ile bu uca kayıt atar. Stok 0→pozitif olduğunda
 * stock-movement hook'u bu endpoint'lere bildirim gönderir.
 *
 * GİRİŞ GEREKİR. Ortak `/store/push/*` middleware'i misafire de izin verir
 * (genel push aboneliği misafirde de çalışmalı), bu yüzden kontrol burada
 * yapılır: yalnız bu uç müşteri hesabına bağlıdır.
 */
const schema = z.object({
  variant_id: z.string().min(1),
  endpoint: z.string().min(1),
  product_id: z.string().optional(),
  product_handle: z.string().optional(),
  product_title: z.string().optional(),
})

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = req.auth_context?.actor_id ?? null
  if (!customerId) {
    return res
      .status(401)
      .json({ message: "Stok bildirimi için giriş yapmalısınız." })
  }

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "variant_id ve endpoint gerekli." })
  }

  const push = req.scope.resolve<PushModuleService>(PUSH_MODULE)
  await push.addStockAlert({
    variant_id: parsed.data.variant_id,
    endpoint: parsed.data.endpoint,
    product_id: parsed.data.product_id ?? null,
    product_handle: parsed.data.product_handle ?? null,
    product_title: parsed.data.product_title ?? null,
    customer_id: customerId,
  })

  return res.json({ success: true })
}
