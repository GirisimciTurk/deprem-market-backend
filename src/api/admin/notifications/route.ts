import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listNotifications, markNotificationsRead } from "../../../lib/notify"

/**
 * GET /admin/notifications?limit=&offset=&unread=1 — admin kontrol merkezi
 * panel-içi bildirimleri (zil ikonu). unread sayısı her zaman döner (rozet için).
 * recipient_type="admin" — tüm adminler ortak görür.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const result = await listNotifications(req.scope, {
    recipientType: "admin",
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
 * POST /admin/notifications  { id? } — id verilirse o bildirimi, verilmezse TÜM
 * okunmamış admin bildirimlerini okundu işaretler.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.body as any)?.id as string | undefined
  const updated = await markNotificationsRead(req.scope, {
    recipientType: "admin",
    id,
  })

  return res.json({ updated })
}
