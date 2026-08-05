import { MedusaService } from "@medusajs/framework/utils"
import WishlistItem from "./models/wishlist-item"

class WishlistModuleService extends MedusaService({
  WishlistItem,
}) {
  /**
   * Müşterinin favori ürün id'leri — en yeni önce.
   */
  async listProductIdsForCustomer(customerId: string): Promise<string[]> {
    const items = await this.listWishlistItems(
      { customer_id: customerId },
      { order: { created_at: "DESC" } }
    )
    return items.map((i) => i.product_id)
  }

  /**
   * Favoriye ekle. Zaten varsa yeni kayıt açmaz (idempotent) — kalp ikonuna
   * iki kez basmak ya da merge'in aynı ürünü tekrar göndermesi hata üretmemeli.
   */
  async addForCustomer(customerId: string, productId: string) {
    const existing = await this.listWishlistItems({
      customer_id: customerId,
      product_id: productId,
    })
    if (existing.length > 0) {
      return existing[0]
    }
    return await this.createWishlistItems({
      customer_id: customerId,
      product_id: productId,
    })
  }

  /**
   * Favoriden çıkar. Kayıt yoksa sessizce geçer (idempotent).
   * Kaç kayıt silindiğini döndürür.
   */
  async removeForCustomer(customerId: string, productId: string): Promise<number> {
    const existing = await this.listWishlistItems({
      customer_id: customerId,
      product_id: productId,
    })
    if (existing.length === 0) {
      return 0
    }
    await this.deleteWishlistItems(existing.map((i) => i.id))
    return existing.length
  }

  /**
   * Toplu ekleme — storefront, giriş anında cihazdaki eski localStorage
   * favorilerini buraya aktarır. Zaten hesapta olanlar atlanır.
   * Yeni eklenen ürün id'lerini döndürür.
   */
  async mergeForCustomer(
    customerId: string,
    productIds: string[]
  ): Promise<string[]> {
    const unique = [...new Set(productIds.filter(Boolean))]
    if (unique.length === 0) {
      return []
    }

    const existing = await this.listWishlistItems({
      customer_id: customerId,
      product_id: unique,
    })
    const existingIds = new Set(existing.map((i) => i.product_id))
    const toCreate = unique.filter((id) => !existingIds.has(id))

    if (toCreate.length > 0) {
      await this.createWishlistItems(
        toCreate.map((product_id) => ({ customer_id: customerId, product_id }))
      )
    }
    return toCreate
  }
}

export default WishlistModuleService
