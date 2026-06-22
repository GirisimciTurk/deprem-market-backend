import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Bir ürün oluşturulduğunda/güncellendiğinde (satıcı düzenlemesi, admin onayı, fiyat
 * vb.) storefront'un statik ürün cache'ini ANINDA tazeler → mağazada eski resim/bilgi
 * görünme sorunu çözülür. Storefront'taki /api/revalidate ucunu çağırır.
 *
 * Yalnız REVALIDATE_SECRET tanımlıysa çalışır (yoksa sessizce atlar — storefront
 * tarafında zaten ≤30 sn'lik zaman-bazlı revalidation devrede). ASLA akışı bozmaz.
 */
const STOREFRONT_URL =
  process.env.STOREFRONT_URL ||
  (process.env.STOREFRONT_DOMAIN ? `https://${process.env.STOREFRONT_DOMAIN}` : "http://localhost:8000")

export default async function productRevalidateHandler({ container }: SubscriberArgs<{ id: string }>) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) return // webhook yapılandırılmamış → ISR tazeliğine güven

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const url = `${STOREFRONT_URL.replace(/\/$/, "")}/api/revalidate?secret=${encodeURIComponent(secret)}&tags=products,sellers,categories`
  try {
    const res = await fetch(url, { method: "POST" })
    if (!res.ok) {
      logger.warn(`[product-revalidate] storefront ${res.status} döndü`)
    }
  } catch (e: any) {
    logger.warn(`[product-revalidate] storefront tazelenemedi: ${e?.message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["product.updated", "product.created"],
}
