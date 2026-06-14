import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { broadcast } from "../../../../lib/web-push"

/**
 * POST /admin/push/broadcast
 * Tüm abonelere pazarlama/kampanya bildirimi yayınlar. (Admin auth zorunlu —
 * /admin/* rotaları varsayılan olarak admin oturumu gerektirir.)
 */
const schema = z.object({
  title: z.string().min(1, "Başlık zorunlu."),
  body: z.string().min(1, "Metin zorunlu."),
  url: z.string().optional(),
  image: z.string().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Geçersiz veri.",
    })
  }
  const { title, body, url, image } = parsed.data

  const result = await broadcast(req.scope, {
    title,
    body,
    url: url || "/",
    image: image || undefined,
    tag: "campaign",
  })

  return res.json(result)
}
