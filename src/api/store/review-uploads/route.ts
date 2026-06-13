import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { reviewLimiter, enforceRateLimit } from "../../../lib/rate-limiter"

const MAX_FILES = 6
const MAX_BYTES = 5 * 1024 * 1024 // dosya başına 5MB (base64 çözülmüş)
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"]

const schema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1).max(200),
        mime_type: z.string(),
        // Saf base64 (data URL öneki olmadan).
        data: z.string().min(1),
      })
    )
    .min(1)
    .max(MAX_FILES),
})

/**
 * POST /store/review-uploads  { files: [{ filename, mime_type, data(base64) }] }
 * Müşteri ürün yorumuna eklenecek fotoğrafları yükler. Dosyalar file modülüne
 * (prod'da Cloudflare R2) public olarak kaydedilir ve URL'leri döner; storefront
 * bu URL'leri yorum gönderimine (images) ekler. Yalnız görsel, en fazla 6 dosya,
 * dosya başına 5MB. Rate-limit'li; misafir de yükleyebilir (yorum gibi).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(reviewLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Geçersiz dosya verisi.", issues: parsed.error.issues })
  }

  // Doğrulama: sadece görsel + boyut sınırı.
  for (const f of parsed.data.files) {
    if (!ALLOWED.includes(f.mime_type)) {
      return res.status(400).json({ message: "Yalnızca görsel (JPEG/PNG/WebP/GIF) yüklenebilir." })
    }
    // base64 uzunluğundan yaklaşık byte: len * 3/4.
    const approxBytes = Math.floor((f.data.length * 3) / 4)
    if (approxBytes > MAX_BYTES) {
      return res.status(400).json({ message: "Her görsel en fazla 5MB olabilir." })
    }
  }

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: parsed.data.files.map((f) => ({
        filename: f.filename,
        mimeType: f.mime_type,
        content: f.data,
        access: "public" as const,
      })),
    },
  })

  const urls = (result as any[]).map((f) => f.url).filter(Boolean)
  return res.status(201).json({ urls })
}
