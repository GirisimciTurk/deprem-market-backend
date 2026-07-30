import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import { OrderStage, aggregateStage, sellerOrderStage, stageLabel } from "./order-stage"

/**
 * Bir siparişin satıcı-bazlı kargo/aşama kırılımı. İKİ uç bunu kullanır:
 *   - /store/seller-shipments (giriş yapmış müşteri, sipariş detay sayfası)
 *   - /store/order-tracking   (misafir takip: sipariş no + e-posta)
 * Ortak tutuluyor ki iki ekran aynı aşamayı söylesin.
 */
export type SellerShipmentDto = {
  seller_order_id: string
  seller_name: string
  seller_handle: string
  /** Türetilmiş aşama — panellerin ve storefront'un okuduğu alan. */
  stage: OrderStage
  stage_label: string
  /** Ham enum. KALDIRILMADI: storefront'un eski sürümü bunu okuyor (geriye dönük uyum). */
  fulfillment_status: string
  preparing_at: Date | string | null
  fulfilled_at: Date | string | null
  carrier: string | null
  tracking_number: string | null
  tracking_url: string | null
  items: unknown
}

export async function buildSellerShipments(
  scope: { resolve: (k: string) => any },
  orderId: string
): Promise<SellerShipmentDto[]> {
  const marketplace: MarketplaceModuleService = scope.resolve(MARKETPLACE_MODULE)
  const sellerOrders = await marketplace.listSellerOrders({ order_id: orderId })

  return Promise.all(
    sellerOrders.map(async (so: any) => {
      let sellerName = ""
      let sellerHandle = ""
      try {
        const seller = await marketplace.retrieveSeller(so.seller_id)
        sellerName = (seller as any)?.name || ""
        sellerHandle = (seller as any)?.handle || ""
      } catch {
        // satıcı silinmişse boş geç
      }

      const stage = sellerOrderStage(so)
      return {
        seller_order_id: so.id,
        seller_name: sellerName,
        seller_handle: sellerHandle,
        stage,
        stage_label: stageLabel(stage),
        fulfillment_status: so.fulfillment_status,
        preparing_at: so.preparing_at ?? null,
        fulfilled_at: so.fulfilled_at ?? null,
        carrier: so.carrier ?? null,
        tracking_number: so.tracking_number ?? null,
        tracking_url: so.tracking_url ?? null,
        items: so.items,
      }
    })
  )
}

/** Sipariş seviyesinde tek aşama — en geride olan pakete göre (bkz. aggregateStage). */
export function shipmentsStage(shipments: SellerShipmentDto[]): OrderStage | null {
  return aggregateStage(shipments)
}
