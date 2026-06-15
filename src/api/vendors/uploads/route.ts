import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { resolveSeller } from "../_lib/resolve-seller"

const MAX_FILES = 12
const MAX_BYTES = 8 * 1024 * 1024 // dosya başına 8MB (base64 çözülmüş)
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]

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
 * POST /vendors/uploads  { files: [{ filename, mime_type, data(base64) }] }
 * Satıcının bilgisayarından seçtiği ürün görsellerini yükler. Dosyalar aktif file
 * provider'a (webp-local → otomatik WebP / yerel disk, ya da S3/R2 kimlikleri
 * tanımlıysa webp-s3 → otomatik WebP + Cloudflare R2) kaydedilir, public URL'leri
 * döner. Yalnız aktif satıcı, yalnız görsel, en fazla 12 dosya, dosya başına 8MB.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })
  if (resolved.seller.status !== "active") {
    return res.status(403).json({ message: "Yalnızca onaylı (aktif) satıcılar görsel yükleyebilir." })
  }

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz dosya verisi.", issues: parsed.error.issues })
  }

  for (const f of parsed.data.files) {
    if (!ALLOWED.includes(f.mime_type)) {
      return res.status(400).json({ message: "Yalnızca görsel (JPEG/PNG/WebP/GIF/AVIF) yüklenebilir." })
    }
    const approxBytes = Math.floor((f.data.length * 3) / 4)
    if (approxBytes > MAX_BYTES) {
      return res.status(400).json({ message: "Her görsel en fazla 8MB olabilir." })
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
