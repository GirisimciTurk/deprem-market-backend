import {
  listShippingOptionsForCartWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
} from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Kargo seçeneği kuralları (shipping_option_rule) yalnızca context'te bulunan
 * attribute'lara göre değerlendirilir. Medusa varsayılan olarak context'e
 * sadece `is_return` ve `enabled_in_store` koyar; bu yüzden "item_total >= X"
 * gibi sepet tutarına bağlı kurallar (ör. Ücretsiz Kargo eşiği) çalışmaz.
 *
 * Bu hook, sepetin `item_total` değerini context'e ekleyerek "1000₺ ve üzeri
 * ücretsiz kargo" gibi kuralların değerlendirilmesini sağlar.
 *
 * Hem fiyatsız hem fiyatlı (checkout) shipping-option workflow'larına eklenir.
 */
async function setItemTotalContext(
  { cart }: { cart: any },
  { container }: { container: any }
) {
  let itemTotal = Number(cart?.item_total)

  // Workflow'un getirdiği cart'ta item_total yoksa yeniden sorgula.
  if (!Number.isFinite(itemTotal)) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "cart",
      filters: { id: cart.id },
      fields: ["item_total"],
    })
    itemTotal = Number(data?.[0]?.item_total ?? 0)
  }

  // ÖNEMLİ: Değeri ondalıklı string ("0.00") olarak döndür.
  // Medusa'nın kural motoru tam sayı string'lerini ("0","1000") Date.parse ile
  // yanlışlıkla tarih sanıp yıl olarak karşılaştırıyor; ".00" eki Date.parse'ı
  // NaN'a düşürerek doğru SAYISAL karşılaştırmayı (gte) garantiler.
  return new StepResponse({ item_total: (itemTotal || 0).toFixed(2) })
}

listShippingOptionsForCartWorkflow.hooks.setShippingOptionsContext(
  setItemTotalContext
)
listShippingOptionsForCartWithPricingWorkflow.hooks.setShippingOptionsContext(
  setItemTotalContext
)
