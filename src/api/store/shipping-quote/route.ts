import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { computeCartCargo, CargoItem } from "../../../lib/cart-cargo"
import { readCargoTariff, pickDims } from "../../../lib/cargo-fee"

/**
 * GET /store/shipping-quote?cart_id=...
 *
 * Sepetin desi-bazlı MÜŞTERİ kargo TAHMİNİNİ döner (her satıcının desi'si + ücretsiz
 * kargo kuralı ayrı, sonra toplam). Sepet sayfası/ürün sayfası bunu gösterir — Medusa
 * kargoyu ancak checkout'ta (teslimat adımında) hesapladığı için sepet özeti aksi halde
 * "Kargo: 0₺" gösterir. Otoriter ücret yine checkout'ta provider.calculatePrice'tan gelir;
 * bu yalnız önizleme (aynı cart-cargo mantığı, DB tarifesiyle).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cartId = (req.query.cart_id as string) || ""
  if (!cartId) return res.status(400).json({ message: "cart_id gerekli." })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "currency_code",
      "items.id",
      "items.quantity",
      "items.unit_price",
      "items.product_id",
      "items.variant.weight",
      "items.variant.length",
      "items.variant.width",
      "items.variant.height",
      "items.product.weight",
    ],
  })
  const cart: any = carts?.[0]
  if (!cart) return res.status(404).json({ message: "Sepet bulunamadı." })

  const items: any[] = cart.items ?? []
  if (items.length === 0) {
    return res.json({ currency_code: cart.currency_code, amount: 0, free: true, sellers: [] })
  }

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))]
  // Boyut/ağırlık kaynağı: varyant öncelikli, ÜRÜN seviyesi fallback (pickDims).
  // Varyantlar boyutsuz doğabildiğinden ürün boyutuna düşmeden hacimsel desi 0 kalırdı (bug).
  const infoByProduct = new Map<
    string,
    { s: string | null; f: number | null; dims: { weight: number; length: number; width: number; height: number } }
  >()
  if (productIds.length > 0) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id", "weight", "length", "width", "height",
        "seller.id", "seller.free_shipping_threshold",
      ],
      filters: { id: productIds },
    })
    for (const p of products as any[]) {
      infoByProduct.set(p.id, {
        s: p.seller?.id ?? null,
        f: p.seller?.free_shipping_threshold ?? null,
        dims: {
          weight: Number(p.weight ?? 0) || 0,
          length: Number(p.length ?? 0) || 0,
          width: Number(p.width ?? 0) || 0,
          height: Number(p.height ?? 0) || 0,
        },
      })
    }
  }

  const cargoItems: CargoItem[] = items.map((it) => {
    const info = infoByProduct.get(it.product_id)
    const dims = pickDims(it.variant, info?.dims)
    const qty = Math.max(1, Number(it.quantity) || 1)
    const unit = Number(it.unit_price ?? 0) || 0
    return {
      seller_id: info?.s ?? null,
      free_shipping_threshold: info?.f ?? null,
      grams: dims.grams,
      lengthCm: dims.lengthCm,
      widthCm: dims.widthCm,
      heightCm: dims.heightCm,
      quantity: qty,
      line_subtotal: unit * qty,
    }
  })

  const tariff = await readCargoTariff(req.scope)
  const result = computeCartCargo(cargoItems, tariff)

  return res.json({
    currency_code: cart.currency_code,
    amount: result.total,
    free: result.total === 0,
    sellers: result.sellers,
  })
}
