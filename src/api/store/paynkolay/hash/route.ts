import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHash } from "crypto"
import { z } from "zod"
import { getPaynkolayConfig } from "../../../../lib/paynkolay-config"
import { hashLimiter, enforceRateLimit } from "../../../../lib/rate-limiter"

const bodySchema = z.object({
  clientRefCode: z.string().min(1).max(128),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a positive decimal"),
  successUrl: z.string().url(),
  failUrl: z.string().url(),
  rnd: z.string().min(1).max(64),
  csCustomerKey: z.string().max(128).optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (enforceRateLimit(hashLimiter, req, res)) return

  const logger = req.scope.resolve("logger")

  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Geçersiz ödeme parametreleri.",
    })
  }
  const { clientRefCode, amount, successUrl, failUrl, rnd } = parsed.data

  try {
    const cfg = getPaynkolayConfig()
    const sx = cfg.sx
    const secretKey = cfg.secretKey

    // Raw hash calculation format: sx|clientRefCode|amount|successUrl|failUrl|rnd||merchantSecretKey
    // Note: The customerKey parameter slot is kept empty in the signature raw string for Vpos redirect requests
    const raw = `${sx}|${clientRefCode}|${amount}|${successUrl}|${failUrl}|${rnd}||${secretKey}`
    const hashDataV2 = createHash("sha512").update(raw, "utf-8").digest("base64")

    return res.status(200).json({
      success: true,
      hashDataV2,
    })
  } catch (error: any) {
    logger.error(`Paynkolay Hash: Error generating hash: ${error?.message}`)
    return res.status(500).json({
      success: false,
      error: "Ödeme imzası oluşturulamadı.",
    })
  }
}
