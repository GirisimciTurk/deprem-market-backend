import fs from "fs"
import os from "os"
import path from "path"

/**
 * E-posta önizleme HTML'ini yazar. ÖNEMLİ: dosyayı PROJE DIŞINA (OS temp) yazar —
 * proje içine (`sent-emails/`) yazmak `npm run dev` watcher'ını restart edip uçuştaki
 * subscriber'ları kesiyordu (dev-only footgun). Prod (`medusa start`) watcher'sız olduğu
 * için zaten etkilenmezdi; bu sadece dev güvenilirliği için.
 *
 * Konum: EMAIL_PREVIEW_DIR env'i ile override edilebilir, yoksa <os.tmpdir()>/deprem-sent-emails.
 * @returns yazılan dosya yolu (hata olursa null).
 */
export function writeEmailPreview(filename: string, html: string): string | null {
  try {
    const dir = process.env.EMAIL_PREVIEW_DIR || path.join(os.tmpdir(), "deprem-sent-emails")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, filename)
    fs.writeFileSync(filePath, html)
    return filePath
  } catch {
    return null
  }
}
