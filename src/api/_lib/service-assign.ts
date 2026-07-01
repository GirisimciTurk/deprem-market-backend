import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SERVICE_REQUEST_MODULE } from "../../modules/service_request"
import type ServiceRequestModuleService from "../../modules/service_request/service"

/**
 * Bir özel hizmet talebine otomatik bayi atar.
 *
 * Kural (MVP): aktif (status="active") satıcılardan, daha önce bu talebi REDDETMEMİŞ
 * olanlar arasından en az iş yükü olanı seçer. Bulunursa assigned_seller_id'yi
 * günceller ve true döner; uygun bayi yoksa false (talep "talep" durumunda atanmamış kalır).
 *
 * Sellerlarda lokasyon alanı olmadığından şimdilik yük dengeleme (least-loaded)
 * uygulanır; ileride şehir/ilçe eşleşmesi eklenebilir.
 */
export async function autoAssignSeller(
  scope: any,
  requestId: string
): Promise<{ assigned: boolean; sellerId?: string }> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const svc = scope.resolve(SERVICE_REQUEST_MODULE) as ServiceRequestModuleService

  const reqRow = await svc.retrieveServiceRequest(requestId).catch(() => null)
  if (!reqRow) return { assigned: false }
  const rejected: string[] = Array.isArray((reqRow as any).rejected_seller_ids)
    ? (reqRow as any).rejected_seller_ids
    : []

  // Aktif satıcılar (komisyon oranı atama anında snapshot'lanır).
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "status", "commission_rate", "is_house", "partner_type"],
  })
  const sellerMap = new Map<string, any>((sellers ?? []).map((s: any) => [s.id, s]))
  const active = (sellers ?? []).filter((s: any) => s.status === "active")
  // Hizmet talepleri HİZMET ortaklarına (partner_type="service") atanır. Fallback
  // KARARI, sistemdeki TÜM aktif hizmet ortaklarına göre verilir (reddedilenlerden
  // bağımsız): en az bir aktif hizmet ortağı varsa, o ortak bu talebi reddetmiş
  // olsa bile ürün satan firmalara DÜŞÜLMEZ (talep atanmamış kalır). Yalnızca
  // sistemde hiç aktif hizmet ortağı yoksa geriye dönük olarak tüm aktif satıcılara
  // düşülür.
  const hasServiceSellers = active.some(
    (s: any) => s.partner_type === "service"
  )
  const eligible = hasServiceSellers
    ? active.filter((s: any) => s.partner_type === "service")
    : active
  const candidates = eligible
    .filter((s: any) => !rejected.includes(s.id))
    .map((s: any) => s.id)
  if (candidates.length === 0) return { assigned: false }

  // En az açık talebe sahip bayiyi seç (basit yük dengeleme).
  const loads = new Map<string, number>(candidates.map((id: string) => [id, 0]))
  const open = await svc.listServiceRequests(
    { assigned_seller_id: candidates, status: ["talep", "kesif_planlandi", "kesif_yapildi", "teklif_gonderildi", "onaylandi", "tedarik", "teslim_edildi", "montaj_planlandi"] },
    { take: null }
  )
  for (const r of open as any[]) {
    if (r.assigned_seller_id && loads.has(r.assigned_seller_id)) {
      loads.set(r.assigned_seller_id, (loads.get(r.assigned_seller_id) || 0) + 1)
    }
  }
  let best = candidates[0]
  let bestLoad = loads.get(best) ?? 0
  for (const id of candidates) {
    const l = loads.get(id) ?? 0
    if (l < bestLoad) {
      best = id
      bestLoad = l
    }
  }

  const bestSeller = sellerMap.get(best)
  await svc.updateServiceRequests({
    id: requestId,
    assigned_seller_id: best,
    // is_house bayi komisyonsuz; aksi halde bayinin güncel oranı snapshot'lanır.
    commission_rate: bestSeller?.is_house ? 0 : Number(bestSeller?.commission_rate ?? 10),
  } as any)
  return { assigned: true, sellerId: best }
}

/**
 * Bir bayiye komisyon oranını (atama anı snapshot'ı) yazar. Manuel atamada
 * (admin seller_id verince) kullanılır; is_house bayi komisyonsuzdur.
 */
export async function snapshotCommissionRate(
  scope: any,
  requestId: string,
  sellerId: string
): Promise<void> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const svc = scope.resolve(SERVICE_REQUEST_MODULE) as ServiceRequestModuleService
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "commission_rate", "is_house"],
    filters: { id: sellerId },
  })
  const s = sellers?.[0]
  await svc.updateServiceRequests({
    id: requestId,
    commission_rate: s?.is_house ? 0 : Number(s?.commission_rate ?? 10),
  } as any)
}
