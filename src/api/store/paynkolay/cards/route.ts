import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHash } from "crypto"
import { z } from "zod"
import { getPaynkolayConfig } from "../../../../lib/paynkolay-config"
import { cardsLimiter, enforceRateLimit } from "../../../../lib/rate-limiter"

// customerKey may be a phone/email/TCKN; restrict to a safe charset and length.
const customerKeySchema = z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9@._+-]+$/)
const tokenSchema = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9._-]+$/)

// Endpoint to list saved cards for a customer key (phone/email/TCKN)
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(cardsLimiter, req, res)) return

  const parsedKey = customerKeySchema.safeParse(req.query.customerKey)
  if (!parsedKey.success) {
    return res.status(400).json({
      success: false,
      error: "Geçersiz müşteri anahtarı.",
    })
  }
  const customerKey = parsedKey.data

  try {
    const cfg = getPaynkolayConfig()
    const sx = cfg.sx
    const secretKey = cfg.secretKey

    // Hash formula for listing: sx | customerKey | merchantSecretKey
    const raw = `${sx}|${customerKey}|${secretKey}`
    const hashDatav2 = createHash("sha512").update(raw, "utf-8").digest("base64")

    const url = `${cfg.baseUrl}/Payment/CardStorageCardList`

    const formData = new URLSearchParams()
    formData.append("sx", sx)
    formData.append("customerKey", customerKey)
    formData.append("hashDatav2", hashDatav2)

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      throw new Error(`Paynkolay CardList HTTP error! status: ${response.status}`)
    }

    const responseText = await response.text()
    let resultData: any
    try {
      resultData = JSON.parse(responseText)
    } catch (e) {
      throw new Error(`Paynkolay response is not valid JSON: ${responseText}`)
    }

    return res.status(200).json({
      success: true,
      data: resultData,
    })
  } catch (error: any) {
    const logger = req.scope.resolve("logger")
    logger.error(`Error listing Paynkolay saved cards: ${error?.message}`)
    return res.status(500).json({
      success: false,
      error: "Kayıtlı kartlar listelenemedi.",
    })
  }
}

// Endpoint to delete a saved card by token
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(cardsLimiter, req, res)) return

  const parsed = z
    .object({ customerKey: customerKeySchema, token: tokenSchema })
    .safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Geçersiz müşteri anahtarı veya kart belirteci.",
    })
  }
  const { customerKey, token } = parsed.data

  try {
    const cfg = getPaynkolayConfig()
    const sx = cfg.sx
    const secretKey = cfg.secretKey

    // Hash formula for deletion: sx | customerKey | token | merchantSecretKey
    const raw = `${sx}|${customerKey}|${token}|${secretKey}`
    const hashDatav2 = createHash("sha512").update(raw, "utf-8").digest("base64")

    const url = `${cfg.baseUrl}/Payment/CardStorageCardDelete`

    const formData = new URLSearchParams()
    formData.append("sx", sx)
    formData.append("customerKey", customerKey)
    formData.append("token", token)
    formData.append("hashDatav2", hashDatav2)

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      throw new Error(`Paynkolay CardDelete HTTP error! status: ${response.status}`)
    }

    const responseText = await response.text()
    let resultData: any
    try {
      resultData = JSON.parse(responseText)
    } catch (e) {
      throw new Error(`Paynkolay response is not valid JSON: ${responseText}`)
    }

    return res.status(200).json({
      success: true,
      data: resultData,
    })
  } catch (error: any) {
    const logger = req.scope.resolve("logger")
    logger.error(`Error deleting Paynkolay saved card: ${error?.message}`)
    return res.status(500).json({
      success: false,
      error: "Kayıtlı kart silinemedi.",
    })
  }
}
