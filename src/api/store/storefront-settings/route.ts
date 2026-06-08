import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve("storefrontSettings") as any
  const key = req.query.key as string

  try {
    if (key) {
      const settings = await service.listStorefrontSettings({ key })
      if (settings.length === 0) {
        return res.status(404).json({ message: `Setting with key ${key} not found` })
      }
      return res.json({ setting: settings[0] })
    }

    const settings = await service.listStorefrontSettings()
    res.json({ settings })
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch settings" })
  }
}
