import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createHash } from "crypto"

// Endpoint to list saved cards for a customer key (phone/email/TCKN)
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerKey = req.query.customerKey as string

    if (!customerKey) {
      return res.status(400).json({
        success: false,
        error: "Missing required query parameter: customerKey is required.",
      })
    }

    const sx = process.env.PAYNKOLAY_SX || "118591467|bScbGDYCtPf7SS1N6PQ6/+58rFhW1WpsWINqvkJFaJlu6bMH2tgPKDQtjeA5vClpzJP24uA0vx7OX53cP3SgUspa4EvYix+1C3aXe++8glUvu9Oyyj3v300p5NP7ro/9K57Zcw=="
    const secretKey = process.env.PAYNKOLAY_SECRET_KEY || "_YckdxUbv4vrnMUZ6VQsr"

    // Hash formula for listing: sx | customerKey | merchantSecretKey
    const raw = `${sx}|${customerKey}|${secretKey}`
    const hashDatav2 = createHash("sha512").update(raw, "utf-8").digest("base64")

    const url = process.env.NODE_ENV === "production"
      ? "https://paynkolay.nkolayislem.com.tr/Vpos/Payment/CardStorageCardList"
      : "https://paynkolaytest.nkolayislem.com.tr/Vpos/Payment/CardStorageCardList"

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
    console.error("Error listing Paynkolay saved cards:", error)
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to list saved cards",
    })
  }
}

// Endpoint to delete a saved card by token
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { customerKey, token } = req.body as {
      customerKey: string
      token: string
    }

    if (!customerKey || !token) {
      return res.status(400).json({
        success: false,
        error: "Missing required body parameters: customerKey and token are required.",
      })
    }

    const sx = process.env.PAYNKOLAY_SX || "118591467|bScbGDYCtPf7SS1N6PQ6/+58rFhW1WpsWINqvkJFaJlu6bMH2tgPKDQtjeA5vClpzJP24uA0vx7OX53cP3SgUspa4EvYix+1C3aXe++8glUvu9Oyyj3v300p5NP7ro/9K57Zcw=="
    const secretKey = process.env.PAYNKOLAY_SECRET_KEY || "_YckdxUbv4vrnMUZ6VQsr"

    // Hash formula for deletion: sx | customerKey | token | merchantSecretKey
    const raw = `${sx}|${customerKey}|${token}|${secretKey}`
    const hashDatav2 = createHash("sha512").update(raw, "utf-8").digest("base64")

    const url = process.env.NODE_ENV === "production"
      ? "https://paynkolay.nkolayislem.com.tr/Vpos/Payment/CardStorageCardDelete"
      : "https://paynkolaytest.nkolayislem.com.tr/Vpos/Payment/CardStorageCardDelete"

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
    console.error("Error deleting Paynkolay saved card:", error)
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to delete saved card",
    })
  }
}
