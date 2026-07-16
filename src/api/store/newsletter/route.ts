import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { NEWSLETTER_MODULE } from "../../../modules/newsletter"
import NewsletterModuleService from "../../../modules/newsletter/service"
import { newsletterLimiter, enforceRateLimit } from "../../../lib/rate-limiter"

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  source: z.string().trim().max(40).optional(),
})

/**
 * POST /store/newsletter — anonim bülten aboneliği.
 * Idempotent: aynı e-posta tekrar gelirse (aktif) yine 200 döner (enumeration
 * yapılmaz, "zaten kayıtlı" gibi bir sinyal verilmez). Abonelikten çıkmış bir
 * e-posta tekrar abone olursa yeniden aktifleştirilir.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(newsletterLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçerli bir e-posta adresi giriniz." })
  }
  const { email, source } = parsed.data

  const service: NewsletterModuleService = req.scope.resolve(NEWSLETTER_MODULE)

  try {
    const existing = await service.listNewsletterSubscribers({ email })
    if (existing.length > 0) {
      // Abonelikten çıkmışsa yeniden aktifleştir; zaten aktifse dokunma.
      if (existing[0].status !== "active") {
        await service.updateNewsletterSubscribers({
          id: existing[0].id,
          status: "active",
        })
      }
    } else {
      await service.createNewsletterSubscribers([
        { email, status: "active", source: source || "footer" },
      ])
    }
  } catch (e) {
    const logger = req.scope.resolve("logger")
    logger.error(`Newsletter subscribe error: ${(e as Error)?.message}`)
    // İç hatayı sızdırma; kullanıcıya nötr mesaj.
    return res.status(500).json({ message: "Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin." })
  }

  return res.status(201).json({ success: true })
}
