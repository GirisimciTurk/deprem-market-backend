import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"

/**
 * Düşük stok uyarısının SATICIYA da gidebilmesi, envanter kaleminden ürünün
 * satıcısına inebilmeye bağlı (inventory_item → variants → product → seller).
 *
 * Bu script bağı uçtan uca doğrular: gerekiyorsa geçici bir satıcı oluşturup bir
 * ürüne bağlar, çözümü kontrol eder ve BIRAKTIĞI HER ŞEYİ GERİ ALIR.
 *
 * Çalıştırma: npx medusa exec ./src/scripts/verify-low-stock-seller.ts
 */
export default async function verifyLowStockSeller({ container }: { container: any }) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const marketplace: any = container.resolve(MARKETPLACE_MODULE)
  const say = (m: string) => console.log(m)

  const resolveSeller = async (inventoryItemId: string) => {
    const { data } = await query.graph({
      entity: "inventory_item",
      fields: [
        "variants.product.id",
        "variants.product.title",
        "variants.product.seller.email",
        "variants.product.seller.name",
      ],
      filters: { id: inventoryItemId },
    })
    const product = data?.[0]?.variants?.[0]?.product
    return { product, seller: product?.seller }
  }

  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
    filters: {},
  })
  if (!items?.length) {
    say("Envanter kalemi yok — test atlandı.")
    return
  }

  // Satıcısı çözülebilen bir kalem ara.
  for (const it of items.slice(0, 20)) {
    const { product, seller } = await resolveSeller(it.id)
    if (seller?.email) {
      say(`GEÇTİ ✓ — mevcut veri: ${product?.title} → ${seller.name} <${seller.email}>`)
      return
    }
  }

  // Yoksa geçici satıcı + bağ kurup doğrula, sonra temizle.
  say("Satıcısı olan ürün yok → geçici satıcı oluşturulup bağ doğrulanacak.")
  const target = items[0]
  const { product: targetProduct } = await resolveSeller(target.id)
  if (!targetProduct?.id) {
    say("KALDI ✗ — envanter kaleminden ürüne inilemedi.")
    return
  }

  const seller = await marketplace.createSellers({
    name: "Doğrulama Satıcısı (geçici)",
    handle: `dogrulama-gecici-${target.id.slice(-8).toLowerCase()}`,
    email: "dogrulama@example.test",
  })
  const sellerId = Array.isArray(seller) ? seller[0].id : seller.id

  try {
    await link.create({
      [MARKETPLACE_MODULE]: { seller_id: sellerId },
      [Modules.PRODUCT]: { product_id: targetProduct.id },
    })

    const { seller: resolved } = await resolveSeller(target.id)
    if (resolved?.email === "dogrulama@example.test") {
      say(`GEÇTİ ✓ — ${targetProduct.title} → ${resolved.name} <${resolved.email}>`)
      say("  Düşük stok uyarısı satıcıya da gidebilir.")
    } else {
      say(`KALDI ✗ — bağ kuruldu ama çözülemedi (dönen: ${JSON.stringify(resolved)})`)
    }
  } finally {
    // Temizlik: bağ + geçici satıcı kaldırılır.
    try {
      await link.dismiss({
        [MARKETPLACE_MODULE]: { seller_id: sellerId },
        [Modules.PRODUCT]: { product_id: targetProduct.id },
      })
    } catch {
      /* bağ kurulamamışsa geç */
    }
    await marketplace.deleteSellers([sellerId])
    say("Temizlendi: geçici satıcı ve bağ kaldırıldı.")
  }
}
