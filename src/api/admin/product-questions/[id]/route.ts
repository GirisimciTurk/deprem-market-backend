import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

/**
 * POST /admin/product-questions/:id  { action: "reject" | "restore" }
 * Moderasyon: uygunsuz soruyu/yanıtı gizle (rejected) veya geri al (yanıtlıysa
 * answered, değilse pending).
 * DELETE /admin/product-questions/:id — kalıcı sil.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const action = (req.body as any)?.action as string | undefined
  if (!action || !["reject", "restore"].includes(action)) {
    return res.status(400).json({ message: "Geçersiz işlem." })
  }

  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const q: any = await marketplace.retrieveProductQuestion(id).catch(() => null)
  if (!q) return res.status(404).json({ message: "Soru bulunamadı." })

  const status =
    action === "reject" ? "rejected" : q.answer ? "answered" : "pending"
  await marketplace.updateProductQuestions({ id, status } as any)

  return res.json({ id, status })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const marketplace: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.deleteProductQuestions(id)
  return res.json({ id, deleted: true })
}
