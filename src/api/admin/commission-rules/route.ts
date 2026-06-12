import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

/**
 * GET /admin/commission-rules — tüm ürün kategorileri + (varsa) komisyon oranları.
 * Kategorinin kuralı yoksa rate=null (o zaman satıcı sabit oranı geçerli).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name"],
    pagination: { take: 1000 } as any,
  })
  const rules = await marketplace.listCommissionRules({}, { take: 1000 })
  const rateByCat = new Map((rules as any[]).map((r) => [r.category_id, Number(r.rate)]))

  const items = (categories as any[]).map((c) => ({
    category_id: c.id,
    category_name: c.name,
    rate: rateByCat.has(c.id) ? rateByCat.get(c.id) : null,
  }))

  return res.json({ rules: items, count: items.length })
}

const schema = z.object({
  category_id: z.string().min(1),
  category_name: z.string().optional().nullable(),
  rate: z.number().min(0).max(100),
})

/** POST /admin/commission-rules { category_id, category_name?, rate } — oranı ayarlar (upsert). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri (category_id + rate 0-100)." })
  }
  const { category_id, category_name, rate } = parsed.data
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)

  const [existing] = await marketplace.listCommissionRules({ category_id }, { take: 1 })
  let rule
  if (existing) {
    rule = await marketplace.updateCommissionRules({ id: (existing as any).id, rate, category_name: category_name ?? (existing as any).category_name })
  } else {
    rule = await marketplace.createCommissionRules({ category_id, category_name: category_name ?? null, rate })
  }
  return res.json({ rule })
}
