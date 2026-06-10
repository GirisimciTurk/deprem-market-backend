import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { getPaynkolayConfig } from "../../../../lib/paynkolay-config"
import { buildInitRequestHash } from "../../../../lib/paynkolay-hash"
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
  if (await enforceRateLimit(hashLimiter, req, res)) return

  const logger = req.scope.resolve("logger")

  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Geçersiz ödeme parametreleri.",
    })
  }
  const { clientRefCode, amount, successUrl, failUrl, rnd, csCustomerKey } = parsed.data

  try {
    const cfg = getPaynkolayConfig()
    const sx = cfg.sx
    const secretKey = cfg.secretKey

    // Paynkolay resmi hash formatı (04-hash-request):
    //   sx|clientRefCode|amount|successUrl|failUrl|rnd|customerKey|merchantSecretKey
    // Doküman: "Kart saklama hizmeti alınmıyorsa CS_CUSTOMER_KEY boş olacaktır."
    // Kart kaydedilmiyorsa customerKey boş ("...|rnd||secret"); kaydediliyorsa veya
    // kayıtlı kartla ödeniyorsa forma POST edilen csCustomerKey ile AYNI değer imzaya
    // girmeli, aksi halde Paynkolay imzayı reddeder.
    const customerKey = csCustomerKey || ""
    const hashDataV2 = buildInitRequestHash({
      sx,
      clientRefCode,
      amount,
      successUrl,
      failUrl,
      rnd,
      customerKey,
      secretKey,
    })

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
