import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/analytics/overview?days=30
 * Müşteri davranışı analitiği — funnel, günlük seri, en çok görüntülenen,
 * "görüntülenip alınmayan", arama (popüler + sonuçsuz). Admin-only.
 *
 * Aggregation SQL'de (knex/PG_CONNECTION) yapılır; binlerce satır JS'e çekilmez.
 * Tutarlar minor (kuruş). Soft-delete satırları (deleted_at) hariç tutulur.
 */
const num = (v: any) => Number(v ?? 0)

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
  const since = new Date(Date.now() - days * 86400000)

  const knex: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const q = (sql: string, binds: any[] = []) => knex.raw(sql, binds).then((r: any) => r.rows as any[])

  // 6 bağımsız aggregation sorgusu PARALEL çalışır (sıralı bekleme yok →
  // yanıt süresi ~en yavaş tek sorgu kadar, toplam değil).
  const [totRows, dailyRows, viewedRaw, boughtRows, topSearchRaw, noResultRaw] = await Promise.all([
    // 1) Tip bazlı sayım + benzersiz oturum/müşteri + ciro
    q(
      `select
         count(*) filter (where type='product_view')  as views,
         count(*) filter (where type='add_to_cart')    as add_to_cart,
         count(*) filter (where type='checkout_start') as checkout_start,
         count(*) filter (where type='purchase')       as purchases,
         coalesce(sum(value) filter (where type='purchase'),0) as revenue,
         count(distinct session_id)  filter (where session_id is not null)  as unique_sessions,
         count(distinct customer_id) filter (where customer_id is not null) as unique_customers
       from analytics_event
       where deleted_at is null and created_at >= ?`,
      [since]
    ),
    // 2) Günlük seri
    q(
      `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
         count(*) filter (where type='product_view') as views,
         count(*) filter (where type='add_to_cart')  as carts,
         count(*) filter (where type='purchase')      as purchases,
         coalesce(sum(value) filter (where type='purchase'),0) as revenue
       from analytics_event
       where deleted_at is null and created_at >= ?
       group by 1 order by 1`,
      [since]
    ),
    // 3) En çok görüntülenen (ilk 30 — viewed-not-bought için fazlasını çekip JS'te eliyoruz)
    q(
      `select product_id, count(*) as views, count(distinct session_id) as sessions
       from analytics_event
       where deleted_at is null and created_at >= ? and type='product_view' and product_id is not null
       group by product_id order by views desc limit 30`,
      [since]
    ),
    // 4) Satın alınan ürün kümesi (purchase.metadata.product_ids jsonb dizisinden)
    q(
      `select distinct jsonb_array_elements_text(metadata->'product_ids') as pid
       from analytics_event
       where deleted_at is null and created_at >= ? and type='purchase'
         and jsonb_typeof(metadata->'product_ids') = 'array'`,
      [since]
    ),
    // 5a) Popüler aramalar
    q(
      `select lower(search_query) as q, count(*) as cnt
       from analytics_event
       where deleted_at is null and created_at >= ? and type='search'
         and coalesce(trim(search_query),'') <> ''
       group by 1 order by cnt desc limit 10`,
      [since]
    ),
    // 5b) Sonuçsuz aramalar
    q(
      `select lower(search_query) as q, count(*) as cnt
       from analytics_event
       where deleted_at is null and created_at >= ? and type='search'
         and results_count = 0 and coalesce(trim(search_query),'') <> ''
       group by 1 order by cnt desc limit 10`,
      [since]
    ),
  ])

  const tot = totRows[0]
  const views = num(tot?.views)
  const addToCart = num(tot?.add_to_cart)
  const checkoutStart = num(tot?.checkout_start)
  const purchases = num(tot?.purchases)
  const revenue = num(tot?.revenue)

  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
  const funnel = [
    { step: "Görüntüleme", key: "view", count: views, rate_from_top: 100 },
    { step: "Sepete Ekleme", key: "add_to_cart", count: addToCart, rate_from_top: rate(addToCart, views) },
    { step: "Ödemeye Geçiş", key: "checkout", count: checkoutStart, rate_from_top: rate(checkoutStart, views) },
    { step: "Satın Alma", key: "purchase", count: purchases, rate_from_top: rate(purchases, views) },
  ]

  const daily = dailyRows.map((r) => ({
    date: r.date,
    views: num(r.views),
    carts: num(r.carts),
    purchases: num(r.purchases),
    revenue: num(r.revenue),
  }))

  const viewedRows = viewedRaw.map((r) => ({
    product_id: r.product_id as string,
    views: num(r.views),
    sessions: num(r.sessions),
  }))

  const boughtSet = new Set<string>(boughtRows.map((r) => r.pid as string))
  const topViewed = viewedRows.slice(0, 10)
  const viewedNotBought = viewedRows.filter((v) => !boughtSet.has(v.product_id)).slice(0, 10)

  const topSearches = topSearchRaw.map((r) => ({ query: r.q as string, count: num(r.cnt) }))
  const noResultSearches = noResultRaw.map((r) => ({ query: r.q as string, count: num(r.cnt) }))

  // Ürün başlıklarını çöz (id → title/thumbnail) — sadece görünür olanları sorgula.
  const productIds = [...new Set([...topViewed, ...viewedNotBought].map((v) => v.product_id))]
  const titleMap = new Map<string, { title: string; thumbnail: string | null; handle: string }>()
  if (productIds.length) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "thumbnail", "handle"],
      filters: { id: productIds } as any,
    })
    for (const p of (products as any[]) ?? []) {
      titleMap.set(p.id, { title: p.title, thumbnail: p.thumbnail ?? null, handle: p.handle })
    }
  }
  const decorate = (rows: { product_id: string; views: number; sessions?: number }[]) =>
    rows.map((r) => ({
      ...r,
      title: titleMap.get(r.product_id)?.title ?? "(silinmiş ürün)",
      thumbnail: titleMap.get(r.product_id)?.thumbnail ?? null,
      handle: titleMap.get(r.product_id)?.handle ?? null,
    }))

  return res.json({
    range_days: days,
    totals: {
      views,
      add_to_cart: addToCart,
      checkout_start: checkoutStart,
      purchases,
      revenue,
      unique_sessions: num(tot?.unique_sessions),
      unique_customers: num(tot?.unique_customers),
    },
    funnel,
    conversion_rate: rate(purchases, views), // ziyaret→satış %
    cart_abandon_rate: rate(addToCart - purchases, addToCart), // sepete eklenip alınmayan %
    daily,
    top_viewed: decorate(topViewed),
    viewed_not_bought: decorate(viewedNotBought),
    top_searches: topSearches,
    no_result_searches: noResultSearches,
  })
}
