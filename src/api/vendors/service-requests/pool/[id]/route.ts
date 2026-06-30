import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { SERVICE_REQUEST_MODULE } from "../../../../../modules/service_request"
import type ServiceRequestModuleService from "../../../../../modules/service_request/service"

const bidSchema = z.object({
  price: z.coerce.number().positive("Geçerli bir fiyat girin (TL)."),
  note: z.string().max(1000).optional(),
})

/**
 * POST /vendors/service-requests/pool/:id  { price, note? }
 * Bayi havuzdaki bir talebe FİYAT (teklif) verir / mevcut teklifini günceller.
 * Teklif tutarı TAM LİRA (major) saklanır. Talep atanmamış ve "talep" durumunda olmalı.
 * Aynı bayinin tekrar göndermesi mevcut teklifini günceller.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (resolved.seller.status !== "active") {
    return res.status(403).json({ message: "Yalnız aktif bayiler teklif verebilir." })
  }

  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const r = (await svc.retrieveServiceRequest(req.params.id).catch(() => null)) as any
  if (!r || !r.is_bidding) {
    return res.status(404).json({ message: "Talep bulunamadı." })
  }
  if (r.assigned_seller_id || r.status !== "talep") {
    return res.status(409).json({ message: "Bu talep için teklifler kapandı." })
  }
  const rejected = Array.isArray(r.rejected_seller_ids) ? r.rejected_seller_ids : []
  if (rejected.includes(resolved.seller.id)) {
    return res.status(403).json({ message: "Bu talebe teklif veremezsiniz." })
  }

  const p = bidSchema.safeParse(req.body)
  if (!p.success) {
    return res.status(400).json({ message: p.error.issues[0]?.message ?? "Geçersiz teklif." })
  }

  const sellerId = resolved.seller.id
  const bids: any[] = Array.isArray(r.bids) ? [...r.bids] : []
  const entry = {
    seller_id: sellerId,
    seller_name: resolved.seller.name,
    price: Math.round(p.data.price), // TAM LİRA
    note: p.data.note ? String(p.data.note) : "",
    created_at: new Date().toISOString(),
  }
  const idx = bids.findIndex((b) => b.seller_id === sellerId)
  if (idx >= 0) bids[idx] = { ...bids[idx], ...entry }
  else bids.push(entry)

  await svc.updateServiceRequests({ id: r.id, bids } as any)
  return res.json({ ok: true, my_bid: { price: entry.price, note: entry.note } })
}
