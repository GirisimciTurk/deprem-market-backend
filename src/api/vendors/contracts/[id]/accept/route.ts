import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createHash } from "crypto"
import { resolveSeller } from "../../../_lib/resolve-seller"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"

const schema = z.object({
  full_name: z.string().trim().min(1).max(160).optional(),
})

/**
 * POST /vendors/contracts/:id/accept  { full_name? }
 * Satıcı, sözleşmenin GÜNCEL sürümünü dijital olarak onaylar (clickwrap). Onay kaydı
 * HUKUKİ DELİL olarak şu unsurlarla saklanır: zaman damgası (created_at) + IP +
 * user-agent + onayı veren yetkilinin ad-soyad beyanı + onaylanan metnin SHA-256
 * özeti (content_hash) + onay anında satıcının kimlik bilgilerinin kopyası
 * (identity_snapshot). Aynı sürüm için idempotent.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const resolved = await resolveSeller(req)
  if (!resolved) return res.status(401).json({ message: "Yetkisiz." })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }

  const service: MarketplaceModuleService = req.scope.resolve(MARKETPLACE_MODULE)
  const contract = await service.retrieveSellerContract(req.params.id).catch(() => null)
  if (!contract || !(contract as any).is_active) {
    return res.status(404).json({ message: "Sözleşme bulunamadı." })
  }

  const version = Number((contract as any).version || 1)
  const sellerId = resolved.seller.id

  // Aynı sürüm zaten onaylandıysa tekrar kayıt oluşturma (idempotent).
  const existing = await service.listSellerContractAcceptances({
    seller_id: sellerId,
    contract_id: req.params.id,
    version,
  })
  if (existing.length > 0) {
    return res.json({ ok: true, already: true })
  }

  // IP — nginx arkasında gerçek istemci X-Forwarded-For'ın ilk değerinde.
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.socket as any)?.remoteAddress ||
    null
  const userAgent = (req.headers["user-agent"] as string)?.slice(0, 500) || null

  // Onaylanan metnin değişmezlik kanıtı: title|version|body üzerinden SHA-256.
  const canonical = `${(contract as any).title}|v${version}|${(contract as any).body ?? ""}`
  const contentHash = createHash("sha256").update(canonical, "utf8").digest("hex")

  // Onay anında satıcının kimlik bilgilerinin kopyası (sonradan değişse bile delil).
  const s = resolved.seller as any
  const identitySnapshot = {
    seller_id: sellerId,
    handle: s.handle ?? null,
    name: s.name ?? null,
    legal_name: s.legal_name ?? null,
    tax_number: s.tax_number ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
  }

  await service.createSellerContractAcceptances([
    {
      seller_id: sellerId,
      contract_id: req.params.id,
      version,
      full_name: parsed.data.full_name ?? null,
      ip,
      user_agent: userAgent,
      content_hash: contentHash,
      identity_snapshot: identitySnapshot,
    },
  ])

  return res.status(201).json({ ok: true })
}
