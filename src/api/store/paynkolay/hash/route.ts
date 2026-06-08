import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHash } from "crypto"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const {
      clientRefCode,
      amount,
      successUrl,
      failUrl,
      rnd,
      csCustomerKey = "",
    } = req.body as {
      clientRefCode: string
      amount: string
      successUrl: string
      failUrl: string
      rnd: string
      csCustomerKey?: string
    }

    if (!clientRefCode || !amount || !successUrl || !failUrl || !rnd) {
      console.error("Paynkolay Hash: Missing parameters. req.body:", req.body)
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: clientRefCode, amount, successUrl, failUrl, rnd are required.",
      })
    }

    const sx = process.env.PAYNKOLAY_SX || "118591467|bScbGDYCtPf7SS1N6PQ6/+58rFhW1WpsWINqvkJFaJlu6bMH2tgPKDQtjeA5vClpzJP24uA0vx7OX53cP3SgUspa4EvYix+1C3aXe++8glUvu9Oyyj3v300p5NP7ro/9K57Zcw=="
    const secretKey = process.env.PAYNKOLAY_SECRET_KEY || "_YckdxUbv4vrnMUZ6VQsr"

    // Raw hash calculation format: sx|clientRefCode|amount|successUrl|failUrl|rnd||merchantSecretKey
    // Note: The customerKey parameter slot is kept empty in the signature raw string for Vpos redirect requests
    const raw = `${sx}|${clientRefCode}|${amount}|${successUrl}|${failUrl}|${rnd}||${secretKey}`
    console.log("Paynkolay Hash: Calculating hash with raw string:", raw)
    const hashDataV2 = createHash("sha512").update(raw, "utf-8").digest("base64")

    return res.status(200).json({
      success: true,
      hashDataV2,
    })
  } catch (error: any) {
    console.error("Paynkolay Hash: Error generating Paynkolay hash:", error)
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate hash",
    })
  }
}
