/**
 * Ürün `metadata` alanından anahtar kaldırma yardımcıları.
 *
 * Medusa ürün metadata'sını REPLACE DEĞİL MERGE eder
 * (`@medusajs/utils` → `mergeMetadata`, `@medusajs/product` → `ProductRepository.deepUpdate`):
 *
 *   - Payload'da BULUNMAYAN anahtar korunur → JS'te `delete metadata.x` ETKİSİZDİR.
 *   - `null` yazmak da anahtarı SİLMEZ, yalnız değerini null yapar.
 *   - Anahtarı gerçekten kaldırmanın TEK yolu değerini boş string yapmaktır:
 *     `mergeMetadata` içinde `if (value === "") delete merged[key]`.
 *
 * Bu davranış hem `updateProductsWorkflow` hem de `productModule.updateProducts`
 * yollarında geçerlidir (entegrasyon probuyla her iki yolda da ölçüldü).
 *
 * DİKKAT: Yalnız `metadata` alanı için geçerlidir. Auth modülündeki `app_metadata`
 * merge EDİLMEZ (düz yazılır) → orada normal `delete` doğrudur, sentinel yanlıştır.
 */

/** `mergeMetadata`'nın "bu anahtarı sil" sentinel'i. */
export const META_REMOVE = ""

/**
 * Verilen anahtarları silinmek üzere işaretler (merge sırasında düşerler).
 * Metadata objesini yerinde değiştirir — mevcut `{...existingMeta}` + mutasyon
 * kalıbına uyar.
 */
export function dropMeta(metadata: Record<string, unknown>, ...keys: string[]): void {
  for (const key of keys) metadata[key] = META_REMOVE
}
