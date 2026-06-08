import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve("storefrontSettings") as any
  try {
    const settings = await service.listStorefrontSettings()
    res.json({ settings })
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch settings" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve("storefrontSettings") as any
  const { key, value } = req.body as { key: string; value: any }

  if (!key) {
    return res.status(400).json({ message: "Key is required" })
  }

  try {
    const existing = await service.listStorefrontSettings({ key })
    let setting

    if (existing.length > 0) {
      setting = await service.updateStorefrontSettings({
        id: existing[0].id,
        value,
      })
    } else {
      setting = await service.createStorefrontSettings({
        key,
        value,
      })
    }

    res.json({ setting })
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to save setting" })
  }
}
