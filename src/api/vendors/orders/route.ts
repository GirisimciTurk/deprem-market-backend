import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { resolveSeller } from "../_lib/resolve-seller"
import { OrderStage } from "../../../lib/order-stage"

/**
 * `stage` parametresi → veritabanı filtresi. Aşama iki alandan türediği için
 * (fulfillment_status + preparing_at) filtre de iki alan üzerinden kurulur.
 * `shipped` ve `canceled` tek alana düşer; `received`/`preparing` ise pending
 * ailesinin preparing_at'e göre ikiye ayrılmış hâlidir.
 */
const STAGE_FILTERS: Record<OrderStage, Record<string, unknown>> = {
  received: { fulfillment_status: "pending", preparing_at: null },
  preparing: { fulfillment_status: "pending", preparing_at: { $ne: null } },
  shipped: { fulfillment_status: "fulfilled" },
  canceled: { fulfillment_status: "canceled" },
}

/**
 * GET /vendors/orders?stage=&status=&payout=&limit=&offset= — satıcının alt-siparişleri.
 *
 * `stage` aşama bazlı yeni filtredir (received|preparing|shipped|canceled).
 * `status` ham enum filtresi olarak GERİYE DÖNÜK UYUM için aynen korunuyor —
 * panelin eski sürümü ve varsa dış tüketiciler kırılmasın.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as string | undefined
  const payout = req.query.payout as string | undefined
  const stage = req.query.stage as string | undefined

  const filters: Record<string, unknown> = { seller_id: resolved.seller.id }
  // Bilinmeyen stage değerinde filtre UYGULANMAZ (tüm kayıtlar döner) —
  // bu yüzden geçerli anahtar kontrolü zorunlu.
  if (stage && stage in STAGE_FILTERS) {
    Object.assign(filters, STAGE_FILTERS[stage as OrderStage])
  }
  if (status && ["pending", "fulfilled", "canceled"].includes(status)) filters.fulfillment_status = status
  if (payout && ["pending", "paid"].includes(payout)) filters.payout_status = payout

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const [orders, count] = await marketplace.listAndCountSellerOrders(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ orders, count, offset, limit })
}
