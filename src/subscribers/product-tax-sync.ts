import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { syncProductTaxFromMetadata } from "../lib/tax-sync"

/**
 * Bir ürün oluşturulduğunda/güncellendiğinde metadata.vat_rate'ini native Medusa
 * Tax Module'e (bracket tax rate + per-product rule) senkronlar. TÜM yazma yollarını
 * tek noktadan kapsar: vendor ürün oluştur/tek-düzenle/toplu + native admin düzenleme.
 * Böylece "metadata.vat_rate yazıldı ama native tax rule güncellenmedi" drift'i
 * (e-fatura yeni oran ↔ checkout eski oran) yapısal olarak imkânsızlaşır.
 *
 * Best-effort: syncProductTaxFromMetadata asla throw etmez (TR tax region yoksa
 * no-op). ASLA ürün akışını bozmaz.
 */
export default async function productTaxSyncHandler({
  event,
  container,
}: SubscriberArgs<{ id?: string; ids?: string[] }>) {
  const data: any = (event as any)?.data || {}
  const ids: string[] = Array.isArray(data.ids)
    ? data.ids
    : data.id
    ? [data.id]
    : []
  for (const id of ids) {
    await syncProductTaxFromMetadata(container, id)
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated"],
}
