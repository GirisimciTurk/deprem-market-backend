import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { WISHLIST_MODULE } from "../../../modules/wishlist"
import WishlistModuleService from "../../../modules/wishlist/service"

/**
 * Müşteri favorileri (storefront'taki kalp ikonu).
 *
 *   GET    /store/wishlist                      → { product_ids: string[] }
 *   POST   /store/wishlist       { product_id } → { product_ids }
 *   DELETE /store/wishlist?product_id=...       → { product_ids }
 *
 * Üçü de giriş ZORUNLU (middlewares.ts'te authenticate("customer")). Giriş yoksa
 * 401 döner; storefront bunu "Favorilere eklemek için giriş yapın" baloncuğuna
 * çevirir.
 *
 * Yalnız ürün id'leri döner, ürünün kendisi değil: storefront ürünleri zaten
 * bölge/fiyat bağlamıyla /store/products'tan çekiyor. Böylece favori listesi
 * fiyat/stok değişince bayatlamaz.
 *
 * Ekleme/çıkarma idempotenttir — kalbe hızlı iki kez basmak hata üretmez.
 */

function getCustomerId(req: AuthenticatedMedusaRequest): string | null {
  return req.auth_context?.actor_id || null
}

function service(req: AuthenticatedMedusaRequest): WishlistModuleService {
  return req.scope.resolve(WISHLIST_MODULE)
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = getCustomerId(req)
  if (!customerId) {
    return res.status(401).json({ message: "Favorileriniz için giriş yapmalısınız." })
  }

  const product_ids = await service(req).listProductIdsForCustomer(customerId)
  return res.json({ product_ids })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = getCustomerId(req)
  if (!customerId) {
    return res
      .status(401)
      .json({ message: "Favorilere eklemek için giriş yapmalısınız." })
  }

  const productId = (req.body as { product_id?: string })?.product_id
  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ message: "product_id gereklidir." })
  }

  const svc = service(req)
  await svc.addForCustomer(customerId, productId)
  const product_ids = await svc.listProductIdsForCustomer(customerId)
  return res.status(201).json({ product_ids })
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const customerId = getCustomerId(req)
  if (!customerId) {
    return res
      .status(401)
      .json({ message: "Favorilerden çıkarmak için giriş yapmalısınız." })
  }

  // product_id query'den okunur: DELETE gövdesi bazı istemcilerde/proxy'lerde
  // düşürülür, query her yerde güvenle taşınır.
  const productId = req.query?.product_id
  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ message: "product_id gereklidir." })
  }

  const svc = service(req)
  await svc.removeForCustomer(customerId, productId)
  const product_ids = await svc.listProductIdsForCustomer(customerId)
  return res.json({ product_ids })
}
