import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHash } from "crypto"
import { installmentsLimiter } from "../../../lib/rate-limiter"

function getFormattedDate(): string {
  const now = new Date()
  const pad = (num: number) => num.toString().padStart(2, "0")
  const day = pad(now.getDate())
  const month = pad(now.getMonth() + 1)
  const year = now.getFullYear()
  return `${day}.${month}.${year}`
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger")
  
  // Rate limiting check
  const rawIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown_ip"
  const clientIp = rawIp.split(",")[0].trim()

  if (installmentsLimiter.isLimited(clientIp)) {
    logger.warn(`Store Installments API: Rate limit exceeded for IP: ${clientIp}`)
    return res.status(429).json({
      success: false,
      error: "Too many requests. Please try again later.",
      retryAfterSeconds: installmentsLimiter.getRemainingSeconds(clientIp)
    })
  }

  logger.info(`Store Installments API: Received request to fetch Paynkolay installment options from IP: ${clientIp}`)

  try {
    const sx =
      process.env.PAYNKOLAY_SX ||
      "118591467|bScbGDYCtPf7SS1N6PQ6/+58rFhW1WpsWINqvkJFaJlu6bMH2tgPKDQtjeA5vClpzJP24uA0vx7OX53cP3SgUspa4EvYix+1C3aXe++8glUvu9Oyyj3v300p5NP7ro/9K57Zcw=="
    const secretKey = process.env.PAYNKOLAY_SECRET_KEY || "_YckdxUbv4vrnMUZ6VQsr"
    
    const date = getFormattedDate()
    logger.debug(`Store Installments API: Formatting date for query: ${date}`)

    const raw = `${sx}|${date}|${secretKey}`
    const hashDatav2 = createHash("sha512").update(raw, "utf-8").digest("base64")
    logger.debug("Store Installments API: Hash signature successfully calculated")

    const url =
      process.env.NODE_ENV === "production"
        ? "https://paynkolay.nkolayislem.com.tr/Vpos/Payment/GetMerchandInformation"
        : "https://paynkolaytest.nkolayislem.com.tr/Vpos/Payment/GetMerchandInformation"

    const formData = new URLSearchParams()
    formData.append("sx", sx)
    formData.append("date", date)
    formData.append("hashDatav2", hashDatav2)

    logger.info(`Store Installments API: Post request outbound to Paynkolay: ${url}`)
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })

    logger.info(`Store Installments API: Inbound response received. Status: ${response.status}`)

    if (!response.ok) {
      logger.error(`Store Installments API: Paynkolay API responded with HTTP status error: ${response.status}`)
      throw new Error(`Paynkolay API HTTP error! status: ${response.status}`)
    }

    const responseText = await response.text()
    let resultData: any
    try {
      resultData = JSON.parse(responseText)
      logger.debug("Store Installments API: Response text successfully parsed into JSON")
    } catch (e) {
      logger.error(`Store Installments API: Response body was not valid JSON. Response body preview: ${responseText.substring(0, 200)}`)
      throw new Error(`Paynkolay response is not valid JSON: ${responseText}`)
    }

    logger.info("Store Installments API: Returning installment information successfully")
    return res.status(200).json({
      success: true,
      data: resultData,
    })
  } catch (error: any) {
    logger.error(`Store Installments API: Error processing request: ${error.message || error}`)
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch installment options",
    })
  }
}
