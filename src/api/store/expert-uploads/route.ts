import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { expertUploadLimiter, enforceRateLimit } from "../../../lib/rate-limiter"

const MAX_FILES = 5
const MAX_BYTES = 10 * 1024 * 1024 // dosya başına 10MB (base64 çözülmüş)
// Belge: diploma / oda kaydı / yetki belgesi → görsel veya PDF.
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"]

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
 * POST /store/expert-uploads  { files: [{ filename, mime_type, data(base64) }] }
 * Uzman/uygulayıcı ön-kayıt formunda yüklenen DOĞRULAMA BELGELERİ (diploma, İMO oda
 * kaydı, yetki belgesi). Dosyalar file modülüne (prod'da R2) kaydedilir, URL'leri döner;
 * storefront bu URL'leri başvuruya (documents) ekler. URL'ler yalnız admin paneline
 * gösterilir, herkese açık dizinde ASLA paylaşılmaz. Görsel veya PDF, en fazla 5 dosya,
 * dosya başına 10MB. Rate-limit'li.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(expertUploadLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Geçersiz dosya verisi.", issues: parsed.error.issues })
  }

  for (const f of parsed.data.files) {
    if (!ALLOWED.includes(f.mime_type)) {
      return res
        .status(400)
        .json({ message: "Yalnızca görsel (JPEG/PNG/WebP) veya PDF yüklenebilir." })
    }
    const approxBytes = Math.floor((f.data.length * 3) / 4)
    if (approxBytes > MAX_BYTES) {
      return res.status(400).json({ message: "Her belge en fazla 10MB olabilir." })
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

  const files = (result as any[]).map((f) => f.url).filter(Boolean)
  return res.status(201).json({ urls: files })
}
