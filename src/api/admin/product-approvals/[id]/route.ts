import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"
import { notifySeller } from "../../../../lib/notify"
import { dropMeta } from "../../../../lib/metadata"

const schema = z.object({
  action: z.enum(["publish", "reject"]),
  // Red gerekçesi — satıcıya bildirimde ve düzenleme ekranında gösterilir.
  reason: z.string().trim().min(1).max(1000).optional(),
})

/**
 * POST /admin/product-approvals/:id  { action: "publish" | "reject", reason? }
 * Satıcı ürününü yayına alır (published) veya reddeder (rejected).
 *
 * Red: gerekçe `metadata.rejection` altında saklanır ve satıcıya panel-içi
 * bildirim gider. Satıcı ürünü düzenleyip kaydedince ürün yeniden "proposed"
 * olur (bkz. vendors/products/[id]) — bu yüzden gerekçe MERGE ile yazılır,
 * mevcut metadata (ai_moderation, attributes vb.) korunur.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz işlem (publish|reject)." })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata", "seller.id"],
    filters: { id: req.params.id },
  })
  const product = data?.[0] as any
  if (!product) return res.status(404).json({ message: "Ürün bulunamadı." })
  if (!product.seller?.id) {
    return res.status(400).json({ message: "Bu ürün bir satıcıya ait değil." })
  }

  const isReject = parsed.data.action === "reject"
  const status = isReject ? "rejected" : "published"
  const reason = parsed.data.reason ?? null

  // metadata MERGE — yalnız red bilgisini değiştir (bkz. src/lib/metadata.ts).
  const metadata = { ...((product.metadata ?? {}) as Record<string, unknown>) }
  if (isReject) {
    metadata.rejection = { reason, at: new Date().toISOString() }
  } else {
    // Yayına alınınca red kaydı düşer; geçmiş için son red saklanır.
    if (metadata.rejection) metadata.last_rejection = metadata.rejection
    dropMeta(metadata, "rejection")
  }

  await updateProductsWorkflow(req.scope).run({
    input: { products: [{ id: product.id, status: status as any, metadata: metadata as any }] },
  })

  // Bildirim best-effort — başarısız olsa da onay/red işlemi geçerli kalır.
  if (isReject) {
    await notifySeller(req.scope, product.seller.id, {
      type: "product_rejected",
      title: `Ürününüz reddedildi: ${product.title}`,
      body: reason
        ? `Gerekçe: ${reason}\n\nÜrünü düzenleyip kaydettiğinizde yeniden onaya gönderilir.`
        : "Ürünü düzenleyip kaydettiğinizde yeniden onaya gönderilir.",
      link: `/products/${product.id}/edit`,
    })
  } else {
    await notifySeller(req.scope, product.seller.id, {
      type: "product_published",
      title: `Ürününüz yayına alındı: ${product.title}`,
      body: "Ürününüz mağazada satışa açıldı.",
      link: `/products/${product.id}/edit`,
    })
  }

  return res.json({ id: product.id, status })
}
