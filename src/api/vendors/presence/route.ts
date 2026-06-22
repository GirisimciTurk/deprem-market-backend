import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"
import { heartbeat, leave } from "../../../lib/presence"

// resource: "<type>:<id>" (ör. "order:01J...", "product:prod_123"). Serbest metin;
// sadece aynı dizgeyi açan kullanıcılar eşleşir.
const beatSchema = z.object({
  resource: z.string().min(1).max(200),
  editing: z.boolean().optional(),
  leave: z.boolean().optional(),
})

/**
 * POST /vendors/presence — "şu an bu kaydı görüntülüyorum" sinyali (heartbeat).
 * Aynı kayıttaki DİĞER aktif kullanıcıları döndürür. `leave:true` ile ayrılış bildirilir.
 * Audit'e YAZILMAZ (middleware'de presence segmenti hariç tutulur).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = beatSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  const adminName =
    [resolved.admin.first_name, resolved.admin.last_name].filter(Boolean).join(" ") ||
    resolved.admin.email ||
    "Bir kullanıcı"

  if (parsed.data.leave) {
    await leave(resolved.seller.id, parsed.data.resource, resolved.admin.id)
    return res.json({ others: [] })
  }

  const others = await heartbeat(
    resolved.seller.id,
    parsed.data.resource,
    { id: resolved.admin.id, name: adminName },
    parsed.data.editing ?? true,
    Date.now()
  )
  return res.json({ others })
}
