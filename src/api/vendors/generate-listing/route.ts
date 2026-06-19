import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"
import { isLlmEnabled, generateProductInfo, type LlmImage } from "../../../lib/llm"
import { fetchImageAsBase64 } from "../../../lib/llm/client"

const bodySchema = z.object({
  title: z.string().trim().min(2).max(300),
  brand: z.string().trim().max(120).optional().nullable(),
  image_url: z.string().trim().url().max(1000).optional().nullable(),
})

/**
 * POST /vendors/generate-listing  { title, brand?, image_url? }
 * İlan otopilotu: başlıktan (ve varsa GÖRSELDEN — vision) satış odaklı açıklama,
 * madde işaretleri ve arama etiketleri üretir; satıcı sihirbazda "AI ile Doldur"
 * butonuyla çağırır, çıktıyı DÜZENLEYEBİLİR. AI kapalı/hata → { ok:false } (fail-open).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  if (!isLlmEnabled()) {
    return res.json({ ok: false, disabled: true })
  }

  // Görsel verildiyse vision için base64'e çevir (başarısızsa sessizce metne düşer).
  let images: LlmImage[] | undefined
  if (parsed.data.image_url) {
    const img = await fetchImageAsBase64(parsed.data.image_url)
    if (img) images = [img]
  }

  const out = await generateProductInfo({
    title: parsed.data.title,
    brand: parsed.data.brand ?? undefined,
    images,
  })
  if (!out.ok) {
    return res.json({ ok: false, error: out.error })
  }

  return res.json({
    ok: true,
    description: out.data.description,
    bullet_points: out.data.bullet_points,
    tags: out.data.tags,
    suggested_category: out.data.suggested_category,
  })
}
