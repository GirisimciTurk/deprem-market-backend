import { MARKETPLACE_MODULE } from "../modules/marketplace"
import type MarketplaceModuleService from "../modules/marketplace/service"

/**
 * Sistem kaydı (audit log) yardımcıları — "kim, ne zaman, ne yaptı".
 * Satıcı panelindeki yazma istekleri izin/audit middleware'i tarafından otomatik
 * kaydedilir; bu dosya kaydı yazar ve yol→Türkçe aksiyon etiketini üretir.
 */

export type AuditActor = {
  adminId?: string | null
  name?: string | null
  email?: string | null
}

export type AuditEntry = {
  sellerId: string
  actor: AuditActor
  action: string
  summary: string
  entityType?: string | null
  entityId?: string | null
  method?: string | null
  path?: string | null
  status?: number | null
  metadata?: Record<string, unknown> | null
}

/** Bir audit kaydı yazar. ASLA throw etmez (loglama iş akışını bozmamalı). */
export async function logSellerAction(container: any, entry: AuditEntry): Promise<void> {
  try {
    const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
    await marketplace.createSellerAuditLogs({
      seller_id: entry.sellerId,
      actor_admin_id: entry.actor.adminId ?? null,
      actor_name: entry.actor.name ?? null,
      actor_email: entry.actor.email ?? null,
      action: entry.action,
      summary: entry.summary,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      method: entry.method ?? null,
      path: entry.path ?? null,
      status: entry.status ?? null,
      metadata: entry.metadata ?? null,
    } as any)
  } catch (e: any) {
    try {
      container.resolve("logger").error(`[SellerAudit] kayıt yazılamadı: ${e?.message}`)
    } catch {}
  }
}

// ── Yol → Türkçe aksiyon eşlemesi ───────────────────────────────────────────
// /vendors yolundan (method + segmentler) makine anahtarı + insan-okur özet üretir.

type Described = { action: string; summary: string; entityType: string | null }

/**
 * Bir /vendors yazma isteğini açıklar.
 * Örn POST /vendors/products → { action:"product.create", summary:"Ürün ekledi" }
 */
export function describeVendorAction(method: string, path: string): Described {
  const M = method.toUpperCase()
  // /vendors/<seg>/<id?>/<sub?> parçaları
  const after = path.split(/[?#]/)[0].split("/vendors/")[1] || ""
  const parts = after.split("/").filter(Boolean)
  const seg = parts[0] || ""
  const hasId = parts.length >= 2 && !["bulk"].includes(parts[1])
  const sub = parts[hasId ? 2 : 1] // id'den sonraki alt-eylem (varsa)

  const def = (action: string, summary: string, entityType: string | null = seg || null): Described => ({
    action,
    summary,
    entityType,
  })

  switch (seg) {
    case "products":
      if (parts[1] === "bulk") return def("product.bulk", "Toplu ürün güncelledi", "product")
      if (M === "DELETE") return def("product.delete", "Ürünü sildi", "product")
      if (hasId) return def("product.update", "Ürünü güncelledi", "product")
      return def("product.create", "Yeni ürün ekledi", "product")
    case "campaigns":
      if (M === "DELETE") return def("campaign.delete", "Kampanyayı/kuponu sildi", "campaign")
      if (hasId) return def("campaign.update", "Kampanyayı/kuponu güncelledi", "campaign")
      return def("campaign.create", "Kampanya/kupon oluşturdu", "campaign")
    case "returns":
      if (sub === "receive") return def("return.receive", "İadeyi teslim aldı", "return")
      if (sub === "reject") return def("return.reject", "İadeyi reddetti", "return")
      return def("return.update", "İade işlemi yaptı", "return")
    case "orders":
      if (sub === "fulfill") return def("order.fulfill", "Siparişi kargoladı", "order")
      return def("order.update", "Sipariş işlemi yaptı", "order")
    case "service-requests":
      return def("service_request.update", "Hizmet talebini güncelledi", "service_request")
    case "questions":
      if (sub === "answer") return def("question.answer", "Soruyu yanıtladı", "question")
      if (sub === "draft") return def("question.draft", "Soru için taslak yanıt üretti", "question")
      return def("question.update", "Soru işlemi yaptı", "question")
    case "conversations":
      if (sub === "messages") return def("message.send", "Müşteriye mesaj gönderdi", "conversation")
      if (sub === "draft") return def("message.draft", "Mesaj taslağı üretti", "conversation")
      return def("conversation.update", "Mesaj işlemi yaptı", "conversation")
    case "invoices":
      if (sub === "mark-issued") return def("invoice.issue", "Faturayı kesildi olarak işaretledi", "invoice")
      return def("invoice.update", "Fatura işlemi yaptı", "invoice")
    case "contracts":
      if (sub === "accept") return def("contract.accept", "Sözleşmeyi kabul etti", "contract")
      return def("contract.update", "Sözleşme işlemi yaptı", "contract")
    case "reviews":
      return def("review.reply", "Değerlendirmeye yanıt verdi", "review")
    case "me":
      return def("settings.update", "Mağaza ayarlarını güncelledi", "seller")
    case "team":
      if (M === "DELETE") return def("team.remove", "Bir çalışanı kaldırdı", "seller_admin")
      if (sub === "reset-password")
        return def("team.reset_password", "Çalışana şifre sıfırlama bağlantısı gönderdi", "seller_admin")
      if (hasId) return def("team.update", "Çalışan iznini/rolünü güncelledi", "seller_admin")
      return def("team.invite", "Yeni çalışan davet etti", "seller_admin")
    default:
      return def(`${seg || "vendor"}.${M.toLowerCase()}`, `${M} ${after}`, seg || null)
  }
}

/** Yazma isteğinden etkilenen kaydın id'sini (yol parametresi) ayıklar. */
export function entityIdFromPath(path: string): string | null {
  const after = path.split(/[?#]/)[0].split("/vendors/")[1] || ""
  const parts = after.split("/").filter(Boolean)
  // /vendors/<seg>/<id> kalıbı (bulk hariç)
  if (parts.length >= 2 && parts[1] !== "bulk") return parts[1]
  return null
}
