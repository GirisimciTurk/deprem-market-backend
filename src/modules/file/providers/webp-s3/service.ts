import { AbstractFileProviderService } from "@medusajs/framework/utils"
import {
  ProviderUploadFileDTO,
  ProviderFileResultDTO,
  ProviderDeleteFileDTO,
} from "@medusajs/framework/types"
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import path from "path"
import sharp from "sharp"

type WebpS3Options = {
  file_url: string
  access_key_id: string
  secret_access_key: string
  region?: string
  bucket: string
  endpoint?: string // Cloudflare R2/MinIO için
  prefix?: string
}

/**
 * Görselleri ÖNCE WebP'e çevirip SONRA S3-uyumlu depoya (Cloudflare R2/MinIO/AWS)
 * yükleyen file provider. @medusajs/file-s3 webp dönüşümü yapmaz; bu provider
 * webp-local'in dönüşümünü R2 yüklemesiyle birleştirir.
 *
 * Görsel olmayan dosyalar (pdf vb.) dönüştürülmeden olduğu gibi yüklenir.
 */
class WebpS3FileProviderService extends AbstractFileProviderService {
  static identifier = "webp-s3"
  protected client: S3Client
  protected bucket: string
  protected fileUrl: string
  protected prefix: string

  constructor(_: any, options: WebpS3Options) {
    super()
    this.bucket = options.bucket
    this.fileUrl = (options.file_url || "").replace(/\/+$/, "")
    this.prefix = options.prefix ? options.prefix.replace(/^\/+|\/+$/g, "") + "/" : ""
    this.client = new S3Client({
      region: options.region || "auto", // R2 "auto" kabul eder
      credentials: {
        accessKeyId: options.access_key_id,
        secretAccessKey: options.secret_access_key,
      },
      ...(options.endpoint
        ? { endpoint: options.endpoint, forcePathStyle: true }
        : {}),
    })
  }

  async upload(file: ProviderUploadFileDTO): Promise<ProviderFileResultDTO> {
    const isImage =
      file.mimeType?.startsWith("image/") ||
      /\.(jpe?g|png|gif|webp|avif|tiff?)$/i.test(file.filename)
    let buffer = Buffer.from(file.content, "base64")
    let filename = file.filename
    let contentType = file.mimeType

    if (isImage && !/\.svg$/i.test(file.filename)) {
      try {
        buffer = (await sharp(buffer).webp({ quality: 85 }).toBuffer()) as any
        filename = file.filename.replace(/\.[^/.]+$/, "") + ".webp"
        contentType = "image/webp"
      } catch (err: any) {
        throw new Error(
          `Görsel WebP'e dönüştürülemedi: ${err.message} | Failed to convert image to WebP: ${err.message}`
        )
      }
    }

    const parsed = path.parse(filename)
    const safeName = parsed.name.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80)
    const key = `${this.prefix}${safeName}-${Date.now()}-${Math.round(
      // Math.random yerine zaman + boyut tabanlı yeterince benzersizdir
      buffer.length % 100000
    )}${parsed.ext}`

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // R2 ACL desteklemez; public erişim bucket/özel alan adı üzerinden sağlanır.
      })
    )

    return {
      url: `${this.fileUrl}/${key}`,
      key,
    }
  }

  async delete(file: ProviderDeleteFileDTO): Promise<void> {
    const keys = Array.isArray(file) ? file : [file]
    for (const f of keys) {
      const key = (f as ProviderDeleteFileDTO).fileKey
      if (!key) continue
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
      )
    }
  }
}

export default WebpS3FileProviderService
