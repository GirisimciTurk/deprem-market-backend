import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { reviewProduct, generateProductInfo, isLlmEnabled } from "../lib/llm"

/**
 * Satıcının eklediği "proposed" ürünü Gemini ile değerlendirir (asenkron) ve
 * eksik açıklamayı doldurmak için içerik önerisi üretir.
 *
 * Eşik bazlı otonomi (çift-onay akışına SAYGILI):
 *   - auto_reject  → status "rejected" (net ihlaller otomatik elenir, admin kuyruğunu temiz tutar)
 *   - auto_approve → AI_PRODUCT_AUTOPUBLISH=true ise "published"; aksi halde "proposed" kalır
 *                    ama AI kararı metadata'ya yazılır (admin tek tıkla yayınlar)
 *   - needs_review → "proposed" (admin kuyruğunda kalır)
 *
 * Karar `metadata.ai_moderation`, içerik önerisi `metadata.ai_suggestions`'a yazılır.
 * Event: `product.created` (Medusa core). Yalnız satıcıya ait + proposed ürünler işlenir.
 */
export default async function productCreatedModerationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!isLlmEnabled()) return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve("logger")

  let product: any
  try {
    const { data: rows } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "subtitle",
        "description",
        "status",
        "metadata",
        "seller.id",
        "categories.name",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      filters: { id: data.id },
    })
    product = rows?.[0]
  } catch {
    return
  }

  // Yalnız satıcıya ait + onay bekleyen ürünler; tekrar işleme (idempotent).
  if (!product || !product.seller?.id) return
  if (product.status !== "proposed") return
  if (product.metadata?.ai_moderation) return

  const category = product.categories?.[0]?.name ?? null
  const tryPrice = product.variants?.[0]?.prices?.find((p: any) => p.currency_code === "try")
  const price = tryPrice ? Math.round(Number(tryPrice.amount) / 100) : null
  const description: string = product.description ?? ""

  // 1) Ürün ilanı değerlendirmesi
  const outcome = await reviewProduct({
    title: product.title,
    description,
    price,
    category,
    brand: product.subtitle ?? null,
  })

  const newMetadata: Record<string, unknown> = { ...(product.metadata ?? {}) }

  if (!outcome.ok) {
    logger.warn(`[ai-moderation] ürün ${data.id} değerlendirme hatası: ${outcome.error}`)
    newMetadata.ai_moderation = { action: "error", reason: String(outcome.error).slice(0, 500) }
    await updateProductsWorkflow(container).run({
      input: { products: [{ id: data.id, metadata: newMetadata as any }] },
    })
    return
  }

  newMetadata.ai_moderation = {
    action: outcome.action,
    verdict: outcome.verdict,
    confidence: Math.round(outcome.confidence * 100),
    reason: outcome.reason.slice(0, 1000),
    at: new Date().toISOString(),
  }

  // 2) Açıklama eksik/çok kısaysa içerik önerisi üret (otomatik UYGULAMA — admin/satıcı uygular)
  if (description.trim().length < 30) {
    const gen = await generateProductInfo({
      title: product.title,
      category,
      brand: product.subtitle ?? null,
    })
    if (gen.ok) {
      newMetadata.ai_suggestions = { ...gen.data, at: new Date().toISOString() }
    }
  }

  // 3) Eşik eylemi → ürün durumu
  const autopublish = process.env.AI_PRODUCT_AUTOPUBLISH === "true"
  let nextStatus: string | undefined
  if (outcome.action === "auto_reject") nextStatus = "rejected"
  else if (outcome.action === "auto_approve" && autopublish) nextStatus = "published"
  // auto_approve (autopublish kapalı) ve needs_review → "proposed" kalır

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        { id: data.id, metadata: newMetadata as any, ...(nextStatus ? { status: nextStatus as any } : {}) },
      ],
    },
  })

  logger.info(
    `[ai-moderation] ürün ${data.id}: ${outcome.action} (${outcome.verdict} %${Math.round(
      outcome.confidence * 100
    )})${nextStatus ? ` → ${nextStatus}` : ""}`
  )
}

export const config: SubscriberConfig = {
  event: "product.created",
}
