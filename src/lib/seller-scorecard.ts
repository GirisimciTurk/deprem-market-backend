import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { sellerRatingAvg } from "./seller-rating"

/**
 * Satıcı performans karnesi + analitik hesaplama (Trendyol "Mağaza Puanı" modeli).
 *
 * Veri kaynakları (hepsi marketplace modülünde):
 *  - seller_order: kargolama süresi, iade, iptal, satış serisi, en çok satanlar
 *  - seller_return: iade oranı/sayısı
 *  - product_question: soru yanıtlama oranı + süresi
 *  - seller.rating_sum/count: müşteri puanı
 *
 * Tutarlar minor unit (kuruş). Karne tek satıcı için hesaplanır; admin tarafı
 * aynı fonksiyonu herhangi bir satıcı için çağırır.
 */

/** Hedef kargolama süresi (gün). Bu süre içinde kargolanan sipariş "zamanında" sayılır. */
export function getShipTargetDays(): number {
  const n = Number(process.env.SHIP_TARGET_DAYS ?? 2)
  return Number.isFinite(n) && n > 0 ? n : 2
}

const HOUR_MS = 1000 * 60 * 60
const DAY_MS = HOUR_MS * 24

export type ScorecardMetric = {
  /** 0-100 normalize edilmiş alt-skor. */
  score: number
  [k: string]: unknown
}

export type SellerScorecard = {
  seller_id: string
  /** Genel skor 0-100 (ağırlıklı). */
  overall_score: number
  /** Harf notu A/B/C/D. */
  grade: "A" | "B" | "C" | "D"
  /** Karneyi anlamlı kılacak yeterli veri var mı (en az 1 sipariş). */
  has_data: boolean
  shipping: {
    score: number
    fulfilled_count: number
    on_time_count: number
    on_time_rate: number // 0-1
    avg_ship_hours: number | null
    target_days: number
  }
  rating: {
    score: number
    avg: number // 0-5
    count: number
  }
  returns: {
    score: number
    return_rate: number // 0-1 (iadeli sipariş / toplam sipariş)
    returned_order_count: number
    total_order_count: number
  }
  questions: {
    score: number
    answer_rate: number // 0-1
    answered_count: number
    total_count: number
    avg_answer_hours: number | null
  }
  cancellation: {
    score: number
    cancel_rate: number // 0-1
    canceled_count: number
    total_order_count: number
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const pct = (n: number) => Math.round(clamp01(n) * 100)

function gradeFor(score: number): "A" | "B" | "C" | "D" {
  if (score >= 85) return "A"
  if (score >= 70) return "B"
  if (score >= 50) return "C"
  return "D"
}

/**
 * Tek satıcı için performans karnesi. İlgili tüm alt-sipariş/iade/soru kayıtlarını
 * çeker (satıcı başına makul hacim) ve bellekte hesaplar.
 */
export async function computeSellerScorecard(
  container: any,
  sellerId: string
): Promise<SellerScorecard> {
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const targetDays = getShipTargetDays()
  const targetMs = targetDays * DAY_MS

  const [seller, orders, returns, questions] = await Promise.all([
    marketplace.retrieveSeller(sellerId).catch(() => null as any),
    marketplace.listSellerOrders({ seller_id: sellerId }, { take: 5000 }),
    marketplace.listSellerReturns({ seller_id: sellerId }, { take: 5000 }),
    marketplace.listProductQuestions({ seller_id: sellerId }, { take: 5000 }),
  ])

  const totalOrders = orders.length

  // --- Kargolama: zamanında kargolama oranı + ortalama kargolama süresi ---
  const fulfilled = orders.filter((o: any) => o.fulfilled_at)
  let onTime = 0
  let shipMsSum = 0
  let shipSamples = 0
  for (const o of fulfilled) {
    const created = new Date(o.created_at as any).getTime()
    const ship = new Date(o.fulfilled_at as any).getTime()
    if (!Number.isFinite(created) || !Number.isFinite(ship) || ship < created) continue
    const diff = ship - created
    shipMsSum += diff
    shipSamples++
    if (diff <= targetMs) onTime++
  }
  const onTimeRate = fulfilled.length > 0 ? onTime / fulfilled.length : 1
  const avgShipHours = shipSamples > 0 ? Math.round((shipMsSum / shipSamples / HOUR_MS) * 10) / 10 : null
  const shippingScore = pct(onTimeRate)

  // --- Müşteri puanı ---
  const avg = sellerRatingAvg(seller?.rating_sum, seller?.rating_count)
  const ratingCount = Number(seller?.rating_count) || 0
  // Yorum yoksa nötr (70) — cezalandırmadan, ama A vermeden.
  const ratingScore = ratingCount > 0 ? pct(avg / 5) : 70

  // --- İade oranı (iadeli sipariş / toplam sipariş) ---
  // received durumundaki iadelerdeki order_id benzersizleri = iadeli sipariş.
  const returnedOrderIds = new Set(
    returns.filter((r: any) => r.status === "received").map((r: any) => r.order_id)
  )
  const returnedOrderCount = returnedOrderIds.size
  const returnRate = totalOrders > 0 ? returnedOrderCount / totalOrders : 0
  const returnsScore = pct(1 - returnRate)

  // --- Soru yanıtlama oranı + süresi (reddedilenler hariç) ---
  const relevantQ = questions.filter((q: any) => q.status !== "rejected")
  const answeredQ = relevantQ.filter((q: any) => q.status === "answered")
  const answerRate = relevantQ.length > 0 ? answeredQ.length / relevantQ.length : 1
  let ansMsSum = 0
  let ansSamples = 0
  for (const q of answeredQ) {
    if (!q.answered_at) continue
    const asked = new Date(q.created_at as any).getTime()
    const answered = new Date(q.answered_at as any).getTime()
    if (!Number.isFinite(asked) || !Number.isFinite(answered) || answered < asked) continue
    ansMsSum += answered - asked
    ansSamples++
  }
  const avgAnswerHours = ansSamples > 0 ? Math.round((ansMsSum / ansSamples / HOUR_MS) * 10) / 10 : null
  const questionsScore = pct(answerRate)

  // --- İptal oranı ---
  const canceled = orders.filter((o: any) => o.fulfillment_status === "canceled").length
  const cancelRate = totalOrders > 0 ? canceled / totalOrders : 0
  const cancellationScore = pct(1 - cancelRate)

  // --- Genel skor (ağırlıklı) ---
  // Kargolama %30, puan %25, iade %15, soru %15, iptal %15.
  const overall = Math.round(
    shippingScore * 0.3 +
      ratingScore * 0.25 +
      returnsScore * 0.15 +
      questionsScore * 0.15 +
      cancellationScore * 0.15
  )

  return {
    seller_id: sellerId,
    overall_score: overall,
    grade: gradeFor(overall),
    has_data: totalOrders > 0,
    shipping: {
      score: shippingScore,
      fulfilled_count: fulfilled.length,
      on_time_count: onTime,
      on_time_rate: Math.round(onTimeRate * 100) / 100,
      avg_ship_hours: avgShipHours,
      target_days: targetDays,
    },
    rating: { score: ratingScore, avg, count: ratingCount },
    returns: {
      score: returnsScore,
      return_rate: Math.round(returnRate * 100) / 100,
      returned_order_count: returnedOrderCount,
      total_order_count: totalOrders,
    },
    questions: {
      score: questionsScore,
      answer_rate: Math.round(answerRate * 100) / 100,
      answered_count: answeredQ.length,
      total_count: relevantQ.length,
      avg_answer_hours: avgAnswerHours,
    },
    cancellation: {
      score: cancellationScore,
      cancel_rate: Math.round(cancelRate * 100) / 100,
      canceled_count: canceled,
      total_order_count: totalOrders,
    },
  }
}

export type DailyPoint = { date: string; orders: number; sales: number; earning: number }
export type TopProduct = {
  product_id: string
  title: string
  thumbnail: string | null
  quantity: number
  revenue: number
}

export type SellerAnalytics = {
  seller_id: string
  period_days: number
  currency_code: string
  totals: {
    orders: number
    sales: number // brüt (subtotal)
    earning: number // net (seller_earning - returned_earning)
    units: number // satılan adet
    avg_order_value: number
  }
  daily: DailyPoint[]
  top_products: TopProduct[]
  status_breakdown: { pending: number; fulfilled: number; canceled: number }
}

/** YYYY-MM-DD (yerel saat). */
function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Satıcı analitiği — son `days` günün satış serisi, en çok satan ürünler,
 * durum dağılımı. Grafik/pano için.
 */
export async function computeSellerAnalytics(
  container: any,
  sellerId: string,
  days = 30
): Promise<SellerAnalytics> {
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
  const period = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30

  const now = new Date()
  const start = new Date(now.getTime() - (period - 1) * DAY_MS)
  start.setHours(0, 0, 0, 0)

  const orders = await marketplace.listSellerOrders(
    { seller_id: sellerId, created_at: { $gte: start } },
    { order: { created_at: "ASC" }, take: 5000 }
  )

  // Boş gün dahil tüm tarih kovaları.
  const buckets = new Map<string, DailyPoint>()
  for (let i = 0; i < period; i++) {
    const d = new Date(start.getTime() + i * DAY_MS)
    buckets.set(dayKey(d), { date: dayKey(d), orders: 0, sales: 0, earning: 0 })
  }

  const productAgg = new Map<string, TopProduct>()
  let totalSales = 0
  let totalEarning = 0
  let totalUnits = 0
  const status = { pending: 0, fulfilled: 0, canceled: 0 }

  for (const o of orders as any[]) {
    const k = dayKey(new Date(o.created_at))
    const bucket = buckets.get(k)
    const sales = Number(o.subtotal ?? 0)
    const earning = Number(o.seller_earning ?? 0) - Number(o.returned_earning ?? 0)
    if (bucket) {
      bucket.orders++
      bucket.sales += sales
      bucket.earning += earning
    }
    totalSales += sales
    totalEarning += earning

    if (o.fulfillment_status === "fulfilled") status.fulfilled++
    else if (o.fulfillment_status === "canceled") status.canceled++
    else status.pending++

    const items = Array.isArray(o.items) ? o.items : []
    for (const it of items) {
      const pid = String(it.product_id ?? it.title ?? "?")
      const qty = Number(it.quantity ?? 0)
      const lineTotal = Number(it.line_total ?? Number(it.unit_price ?? 0) * qty)
      totalUnits += qty
      const existing = productAgg.get(pid)
      if (existing) {
        existing.quantity += qty
        existing.revenue += lineTotal
      } else {
        productAgg.set(pid, {
          product_id: pid,
          title: String(it.title ?? "Ürün"),
          thumbnail: it.thumbnail ?? null,
          quantity: qty,
          revenue: lineTotal,
        })
      }
    }
  }

  const top_products = Array.from(productAgg.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)

  const orderCount = orders.length

  return {
    seller_id: sellerId,
    period_days: period,
    currency_code: (orders[0] as any)?.currency_code || "try",
    totals: {
      orders: orderCount,
      sales: totalSales,
      earning: totalEarning,
      units: totalUnits,
      avg_order_value: orderCount > 0 ? Math.round(totalSales / orderCount) : 0,
    },
    daily: Array.from(buckets.values()),
    top_products,
    status_breakdown: status,
  }
}
