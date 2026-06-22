import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveSeller } from "../_lib/resolve-seller"

/**
 * GET /vendors/audit-logs — mağazanın sistem kayıtları (kim, ne zaman, ne yaptı).
 * Filtreler: actor_admin_id, action, entity_type, q (özet arama), from, to, limit, offset.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const q = req.query as Record<string, string | undefined>
  const limit = Math.min(Math.max(parseInt(q.limit || "50", 10) || 50, 1), 200)
  const offset = Math.max(parseInt(q.offset || "0", 10) || 0, 0)

  const filters: Record<string, any> = { seller_id: resolved.seller.id }
  if (q.actor_admin_id) filters.actor_admin_id = q.actor_admin_id
  if (q.action) filters.action = q.action
  if (q.entity_type) filters.entity_type = q.entity_type
  // Tarih aralığı (created_at) — ISO veya YYYY-MM-DD.
  const createdAt: Record<string, any> = {}
  if (q.from) createdAt.$gte = new Date(q.from)
  if (q.to) createdAt.$lte = new Date(q.to)
  if (Object.keys(createdAt).length) filters.created_at = createdAt

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data, metadata } = await query.graph({
    entity: "seller_audit_log",
    fields: [
      "id",
      "actor_admin_id",
      "actor_name",
      "actor_email",
      "action",
      "summary",
      "entity_type",
      "entity_id",
      "method",
      "path",
      "status",
      "created_at",
    ],
    filters: filters as any,
    pagination: {
      take: limit,
      skip: offset,
      order: { created_at: "DESC" },
    },
  })

  // Serbest-metin özet araması (DB-tarafı LIKE yerine basit in-memory; sayfa başına yeterli).
  let logs = data || []
  if (q.q) {
    const needle = q.q.toLowerCase()
    logs = logs.filter(
      (l: any) =>
        String(l.summary || "").toLowerCase().includes(needle) ||
        String(l.actor_name || "").toLowerCase().includes(needle)
    )
  }

  return res.json({
    logs,
    count: (metadata as any)?.count ?? logs.length,
    limit,
    offset,
  })
}
