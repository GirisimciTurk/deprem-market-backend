import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { WISHLIST_MODULE } from "../../../../modules/wishlist"
import WishlistModuleService from "../../../../modules/wishlist/service"

/**
 * POST /store/wishlist/merge   { product_ids: string[] }
 *
 * Favoriler hesaba taşınmadan ÖNCE cihazın localStorage'ında biriken ürünleri
 * giriş anında hesaba aktarır. Hesapta zaten olanlar atlanır; hiçbir şey silinmez.
 *
 * Yanıt: { product_ids }  → birleşmiş TAM liste (storefront doğrudan bunu kullanır)
 *        { merged_count } → kaç yeni kayıt eklendiği (storefront kullanıcıya bildirir)
 */

// Tek istekte aktarılabilecek üst sınır: kötü niyetli/bozuk bir gövdenin binlerce
// satır açmasını engeller. Gerçek favori listeleri bunun çok altında kalır.
const MAX_MERGE_ITEMS = 200

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: "Giriş gerekli." })
  }

  const body = (req.body ?? {}) as { product_ids?: unknown }
  const raw = body.product_ids

  if (!Array.isArray(raw)) {
    return res.status(400).json({ message: "product_ids bir dizi olmalıdır." })
  }

  const productIds = raw
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, MAX_MERGE_ITEMS)

  const svc: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  const merged = await svc.mergeForCustomer(customerId, productIds)
  const product_ids = await svc.listProductIdsForCustomer(customerId)

  return res.json({ product_ids, merged_count: merged.length })
}
