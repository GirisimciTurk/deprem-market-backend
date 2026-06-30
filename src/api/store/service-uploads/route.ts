import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { reviewLimiter, enforceRateLimit } from "../../../lib/rate-limiter"

const MAX_FILES = 8
const MAX_BYTES = 25 * 1024 * 1024 // dosya başına 25MB (kısa video dahil)
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]

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
 * POST /store/service-uploads  { files: [{ filename, mime_type, data(base64) }] }
 * Müşteri hizmet talebine (Ürün + Hizmet) ait fotoğraf/video yükler; bayiler bu
 * görsellere göre uzaktan teklif verir. Dosyalar file modülüne (prod'da R2) public
 * kaydedilir, URL listesi döner. Storefront URL'leri talebe (assessment_mode=media,
 * media[]) bağlar. Görsel + kısa video, en fazla 8 dosya, dosya başına 25MB.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(reviewLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Geçersiz dosya verisi.", issues: parsed.error.issues })
  }

  for (const f of parsed.data.files) {
    if (!ALLOWED.includes(f.mime_type)) {
      return res.status(400).json({
        message: "Yalnızca görsel (JPEG/PNG/WebP/GIF) veya video (MP4/WebM/MOV) yüklenebilir.",
      })
    }
    // base64 uzunluğundan yaklaşık byte: len * 3/4.
    const approxBytes = Math.floor((f.data.length * 3) / 4)
    if (approxBytes > MAX_BYTES) {
      return res.status(400).json({ message: "Her dosya en fazla 25MB olabilir." })
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

  const files = (result as any[]).map((f, i) => ({
    url: f.url,
    type: parsed.data.files[i]?.mime_type.startsWith("video/") ? "video" : "image",
  }))
  return res.status(201).json({ files })
}
