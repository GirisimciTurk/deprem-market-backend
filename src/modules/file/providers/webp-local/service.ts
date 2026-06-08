import { AbstractFileProviderService } from "@medusajs/framework/utils"
import { ProviderUploadFileDTO, ProviderFileResultDTO, ProviderDeleteFileDTO } from "@medusajs/framework/types"
import fs from "fs"
import path from "path"
import sharp from "sharp"

class WebpLocalFileProviderService extends AbstractFileProviderService {
  static identifier = "webp-local"
  protected uploadDir: string
  protected backendUrl: string

  constructor(_: any, options: { upload_dir?: string; backend_url?: string } = {}) {
    super()
    this.uploadDir = path.resolve(options.upload_dir || "static")
    this.backendUrl = options.backend_url || "http://localhost:9000/static"

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true })
    }
  }

  async upload(file: ProviderUploadFileDTO): Promise<ProviderFileResultDTO> {
    const isImage = file.mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.filename)
    let buffer = Buffer.from(file.content, "base64")
    let filename = file.filename

    if (isImage) {
      try {
        buffer = (await sharp(buffer).webp({ quality: 85 }).toBuffer()) as any
        filename = file.filename.replace(/\.[^/.]+$/, "") + ".webp"
      } catch (err: any) {
        throw new Error(`Görsel WebP formatına dönüştürülemedi: ${err.message} | Failed to convert image to WebP: ${err.message}`)
      }
    }

    const parsed = path.parse(filename)
    const uniqueName = `${parsed.name}-${Date.now()}${parsed.ext}`
    await fs.promises.writeFile(path.join(this.uploadDir, uniqueName), buffer)

    return {
      url: `${this.backendUrl}/${uniqueName}`,
      key: uniqueName,
    }
  }

  async delete(file: ProviderDeleteFileDTO): Promise<void> {
    const absolutePath = path.join(this.uploadDir, file.fileKey)
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath)
    }
  }
}

export default WebpLocalFileProviderService
