import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /store/recommendations?product_id=...&limit=8
 * "Birlikte sıkça alınanlar" — verilen ürünle AYNI siparişlerde geçen diğer
 * ürünleri birliktelik sıklığına göre sıralar (gerçek sipariş geçmişinden).
 *
 * order_line_item'da order_id YOK → eşleme order_item (order_id, item_id) üzerinden.
 * Yalnız sıralı `product_ids` döner; fiyat/region storefront kendi pipeline'ıyla
 * çözer (doğru bölgesel fiyat). Veri yoksa boş döner (storefront bölümü gizlenir).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = String(req.query.product_id || "").trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20)
  if (!productId) {
    return res.status(400).json({ message: "product_id gereklidir." })
  }

  const knex: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const rows = await knex
    .raw(
      `select oli2.product_id as pid, count(distinct oi1.order_id) as cnt
       from order_item oi1
       join order_line_item oli1 on oli1.id = oi1.item_id and oli1.deleted_at is null
       join order_item oi2 on oi2.order_id = oi1.order_id and oi2.deleted_at is null
       join order_line_item oli2 on oli2.id = oi2.item_id and oli2.deleted_at is null
       where oli1.product_id = ? and oli2.product_id is not null and oli2.product_id <> ?
         and oi1.deleted_at is null
       group by oli2.product_id
       order by cnt desc, oli2.product_id
       limit ?`,
      [productId, productId, limit]
    )
    .then((r: any) => r.rows as any[])

  return res.json({
    product_ids: rows.map((r) => r.pid as string),
    source: "bought_together",
  })
}
