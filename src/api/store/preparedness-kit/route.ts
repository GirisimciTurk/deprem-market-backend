import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { isLlmEnabled, assistPreparedness } from "../../../lib/llm"

const bodySchema = z.object({
  // Serbest metin: hazırlık seti isteği VEYA güvenlik/hazırlık sorusu.
  need: z.string().trim().min(3).max(800),
})

/**
 * POST /store/preparedness-kit  { need }
 * Deprem Hazırlık & Güvenlik Asistanı: müşterinin serbest metnini sınıflandırıp ya
 * YAYINDAKİ ürünlerden bir set önerir ya da güvenlik rehberliği verir. Yapısal/bina
 * güvenliği konularında KESİN HÜKÜM vermez; recommend_survey=true ile uzman keşfine
 * yönlendirir. items yalnız ürün id+adet+gerekçe döner; storefront tam ürünleri çeker.
 * AI kapalı/hata → { items: [], answer: "" } (fail-open). Publishable key zorunludur.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz istek.", issues: parsed.error.issues })
  }

  if (!isLlmEnabled()) {
    return res.json({ items: [], answer: "", recommend_survey: false, survey_reason: "", disabled: true })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "categories.name"],
    filters: { status: "published" },
    pagination: { take: 300 },
  })

  const list = (products as any[] | undefined ?? []).map((p) => ({
    id: p.id,
    title: p.title as string,
    category: (p.categories?.[0]?.name as string) || "",
  }))
  if (list.length === 0) {
    return res.json({ items: [], answer: "", recommend_survey: false, survey_reason: "" })
  }

  const out = await assistPreparedness({ message: parsed.data.need, products: list })
  if (!out.ok) {
    return res.json({ items: [], answer: "", recommend_survey: false, survey_reason: "", error: out.error })
  }

  return res.json({
    items: out.data.items,
    answer: out.data.answer,
    recommend_survey: out.data.recommend_survey,
    survey_reason: out.data.survey_reason,
  })
}
