import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { refreshCartItemsWorkflow } from "@medusajs/core-flows"
import { z } from "zod"

const schema = z.object({ cart_id: z.string().min(1) })

/**
 * POST /store/refresh-cart-prices  { cart_id }
 *
 * Sepetteki kalemlerin birim fiyatlarını GÜNCEL fiyatlara (baz fiyat + aktif
 * sale kampanyaları/price-list'ler) göre yeniden hesaplar. Medusa, sepete ekleme
 * anındaki fiyatı saklar ve bir sepet mutasyonu olana dek tazelemez; bu uç,
 * storefront sepet/checkout sayfası açılınca çağrılarak müşterinin DAİMA güncel
 * fiyatı görmesini/ödemesini sağlar (ör. kampanya başlayınca/bitince).
 *
 * Best-effort: sepet yoksa/boşsa sessizce {success:false} döner, akışı bozmaz.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "cart_id gereklidir." })
  }

  try {
    await refreshCartItemsWorkflow(req.scope).run({
      input: { cart_id: parsed.data.cart_id, force_refresh: true },
    })
    return res.json({ success: true })
  } catch {
    return res.json({ success: false })
  }
}
