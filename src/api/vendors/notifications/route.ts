import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveSeller } from "../_lib/resolve-seller"
import { listNotifications, markNotificationsRead } from "../../../lib/notify"

/**
 * GET /vendors/notifications?limit=&offset=&unread=1 — satıcının panel-içi
 * bildirimleri (zil ikonu). unread sayısı her zaman döner (rozet için).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const result = await listNotifications(req.scope, {
    recipientType: "seller",
    sellerId: resolved.seller.id,
    limit: Number(req.query.limit) || 20,
    offset: Number(req.query.offset) || 0,
    onlyUnread: req.query.unread === "1" || req.query.unread === "true",
  })

  return res.json({
    notifications: result.items,
    count: result.count,
    unread: result.unread,
    offset: result.offset,
    limit: result.limit,
  })
}

/**
 * POST /vendors/notifications/mark-read  { id? } — id verilirse o bildirimi,
 * verilmezse satıcının TÜM okunmamışlarını okundu işaretler.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const id = (req.body as any)?.id as string | undefined
  const updated = await markNotificationsRead(req.scope, {
    recipientType: "seller",
    sellerId: resolved.seller.id,
    id,
  })

  return res.json({ updated })
}
