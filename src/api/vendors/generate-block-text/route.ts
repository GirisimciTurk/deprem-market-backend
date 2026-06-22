import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"
import { isLlmEnabled, generateBlockText, type LlmImage } from "../../../lib/llm"
import { fetchImageAsBase64 } from "../../../lib/llm/client"

const bodySchema = z.object({
  image_url: z.string().trim().url().max(1000).optional().nullable(),
  title: z.string().trim().max(300).optional().nullable(),
  brand: z.string().trim().max(120).optional().nullable(),
  // Mevcut metin / yönlendirme ipucu (varsa) — üretilecek paragrafa bağlam.
  hint: z.string().trim().max(600).optional().nullable(),
})

/**
 * POST /vendors/generate-block-text  { image_url?, title?, brand?, hint? }
 * İçerik bloğu (foto + yazı) için, GÖRSELİ (vision) + ürün başlığını anlatan kısa bir
 * Türkçe paragraf üretir. Satıcı sihirbazda blok başına "AI ile Doldur" ile çağırır,
 * çıktıyı DÜZENLEYEBİLİR. AI kapalı/hata → { ok:false } (fail-open).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  // En azından bir görsel ya da başlık olmalı (yoksa anlamlı metin üretilemez).
  if (!parsed.data.image_url && (parsed.data.title ?? "").trim().length < 2) {
    return res.status(400).json({ message: "Görsel veya ürün başlığı gerekli." })
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

  const out = await generateBlockText({
    title: parsed.data.title ?? undefined,
    brand: parsed.data.brand ?? undefined,
    hint: parsed.data.hint ?? undefined,
    images,
  })
  if (!out.ok) {
    return res.json({ ok: false, error: out.error })
  }

  return res.json({ ok: true, text: out.text })
}
