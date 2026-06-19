import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * RFM tabanlı müşteri segmentasyonu — gerçek sipariş geçmişinden (recency /
 * frequency / monetary). Hedefli kampanya ve davranış analitiği için kullanılır.
 * Tutarlar minor (kuruş).
 */
export type SegmentKey = "champions" | "loyal" | "new" | "at_risk" | "dormant" | "lost"

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  champions: "Şampiyonlar",
  loyal: "Sadık Müşteriler",
  new: "Yeni Müşteriler",
  at_risk: "Risk Altında",
  dormant: "Uykuda",
  lost: "Kayıp",
}

export const SEGMENT_DESCRIPTIONS: Record<SegmentKey, string> = {
  champions: "Sık ve yakın zamanda alışveriş yapan en değerli müşteriler.",
  loyal: "Düzenli alışveriş yapan, tekrarlı müşteriler.",
  new: "İlk siparişini yakın zamanda vermiş müşteriler.",
  at_risk: "Eskiden alışveriş yapan ama bir süredir uğramayan müşteriler.",
  dormant: "Tek sipariş vermiş ve hareketsizleşen müşteriler.",
  lost: "Uzun süredir (180+ gün) alışveriş yapmayan müşteriler.",
}

export interface CustomerRFM {
  customer_id: string
  orders: number
  monetary: number
  last_order: string
  recency_days: number
  segment: SegmentKey
}

export interface SegmentSummary {
  key: SegmentKey
  label: string
  description: string
  count: number
  total_monetary: number
  avg_orders: number
}

function classify(recencyDays: number, freq: number, _monetary: number): SegmentKey {
  if (recencyDays > 180) return "lost"
  if (recencyDays > 90) return "at_risk"
  if (freq >= 4 && recencyDays <= 45) return "champions"
  if (freq >= 2) return "loyal"
  if (freq === 1 && recencyDays <= 30) return "new"
  return "dormant"
}

/** Her müşteri için RFM + segment (sipariş veren tüm müşteriler). */
export async function computeCustomerRFM(container: MedusaContainer): Promise<CustomerRFM[]> {
  const knex: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const rows: any[] = await knex
    .raw(
      `select o.customer_id,
              count(distinct o.id) as orders,
              max(o.created_at)    as last_order,
              coalesce(sum(oli.unit_price * oi.quantity), 0) as monetary
       from "order" o
       join order_item oi       on oi.order_id = o.id   and oi.deleted_at is null
       join order_line_item oli on oli.id = oi.item_id  and oli.deleted_at is null
       where o.deleted_at is null and o.customer_id is not null
       group by o.customer_id`
    )
    .then((r: any) => r.rows as any[])

  const now = Date.now()
  return rows.map((r) => {
    const recencyDays = Math.floor((now - new Date(r.last_order).getTime()) / 86400000)
    const orders = Number(r.orders)
    const monetary = Number(r.monetary)
    return {
      customer_id: r.customer_id as string,
      orders,
      monetary,
      last_order: r.last_order,
      recency_days: recencyDays,
      segment: classify(recencyDays, orders, monetary),
    }
  })
}

/** RFM listesini segment bazında özetler (sabit segment sırasıyla). */
export function summarizeSegments(rfm: CustomerRFM[]): SegmentSummary[] {
  const order: SegmentKey[] = ["champions", "loyal", "new", "at_risk", "dormant", "lost"]
  return order.map((key) => {
    const members = rfm.filter((c) => c.segment === key)
    const total_monetary = members.reduce((a, c) => a + c.monetary, 0)
    const totalOrders = members.reduce((a, c) => a + c.orders, 0)
    return {
      key,
      label: SEGMENT_LABELS[key],
      description: SEGMENT_DESCRIPTIONS[key],
      count: members.length,
      total_monetary,
      avg_orders: members.length ? Math.round((totalOrders / members.length) * 10) / 10 : 0,
    }
  })
}
