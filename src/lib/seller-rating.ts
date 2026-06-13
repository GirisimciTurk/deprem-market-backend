/**
 * Satıcı ortalama puanını (0-5, tek ondalık) puan toplamı + sayısından hesaplar.
 * Seller modeli rating_sum/rating_count'ı tam sayı tutar (model.number() integer);
 * ortalama okunurken bu fonksiyonla türetilir.
 */
export function sellerRatingAvg(sum?: number | null, count?: number | null): number {
  const s = Number(sum) || 0
  const c = Number(count) || 0
  if (c <= 0) return 0
  return Math.round((s / c) * 10) / 10
}
