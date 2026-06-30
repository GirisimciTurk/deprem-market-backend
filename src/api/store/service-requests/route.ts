import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { SERVICE_REQUEST_MODULE } from "../../../modules/service_request"
import type ServiceRequestModuleService from "../../../modules/service_request/service"
import { autoAssignSeller } from "../../_lib/service-assign"

const SERVICE_KINDS = [
  "carbon_fiber", "panic_room", "descent", "capsule_bed", "gas_cutoff", "other",
] as const

const isTrue = (v: unknown) => v === true || v === "true" || v === 1 || v === "1"

/**
 * POST /store/service-requests
 * Müşteri bir hizmet ürünü için keşif/proje talebi açar (sepete at yerine).
 * Giriş yapmışsa customer_id bağlanır; misafir de açabilir (iletişim formdan gelir).
 * Talep "talep" durumunda oluşur; admin/bayi akışı (keşif→teklif→montaj) sonra işler.
 */
const schema = z.object({
  product_id: z.string().optional(),
  service_title: z.string().optional(),
  service_kind: z
    .enum(["carbon_fiber", "panic_room", "descent", "capsule_bed", "gas_cutoff", "other"])
    .default("other"),
  requires_survey: z.boolean().optional(),
  full_name: z.string().min(2, "Ad soyad gerekli."),
  email: z.string().email("Geçerli e-posta gerekli."),
  phone: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  address: z.string().optional(),
  details: z.any().optional(), // ürüne özgü ölçüler (kat, m², bina yaşı...)
  preferred_dates: z.array(z.string()).optional(),
  note: z.string().optional(),
})

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Geçersiz talep verisi.",
    })
  }
  const customerId = req.auth_context?.actor_id ?? null

  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)

  // ── Havuz/teklif akışı kararı ──
  // Talep "hizmet verilebilir" işaretli bir ÜRÜNDEN açıldıysa (product.metadata.is_serviceable),
  // otomatik atama YAPILMAZ: talep havuza düşer (is_bidding=true), tüm bayiler fiyat verir,
  // admin en düşük teklifi seçer. Ürün başlığı/hizmet türü üründen türetilir. Aksi halde
  // (vitrin talebi / işaretsiz ürün) eski davranış: otomatik bayi ataması.
  let isBidding = false
  let serviceTitle = parsed.data.service_title
  let serviceKind: (typeof SERVICE_KINDS)[number] = parsed.data.service_kind

  if (parsed.data.product_id) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query
      .graph({
        entity: "product",
        fields: ["id", "title", "metadata"],
        filters: { id: parsed.data.product_id },
      })
      .catch(() => ({ data: [] as any[] }))
    const product = products?.[0]
    const meta = (product?.metadata ?? {}) as Record<string, unknown>
    if (product && isTrue(meta.is_serviceable)) {
      isBidding = true
      serviceTitle = serviceTitle || product.title
      const mk = String(meta.service_kind ?? "")
      if ((SERVICE_KINDS as readonly string[]).includes(mk)) {
        serviceKind = mk as (typeof SERVICE_KINDS)[number]
      }
    }
  }

  const created = await svc.createServiceRequests({
    ...parsed.data,
    service_title: serviceTitle ?? "",
    service_kind: serviceKind,
    // Havuz akışında keşif yok (bayiler direkt fiyat verir).
    requires_survey: isBidding ? false : parsed.data.requires_survey,
    is_bidding: isBidding,
    customer_id: customerId,
    status: "talep",
    offer_decision: "pending",
    payment_status: "none",
  } as any)

  // Otomatik bayi ata (best-effort; uygun bayi yoksa atanmamış kalır → admin elle atar).
  // Havuz/teklif akışında atama YAPILMAZ — bayiler teklif verir, admin kazananı seçer.
  if (!isBidding) {
    try {
      await autoAssignSeller(req.scope, (created as any).id)
    } catch {
      /* atama hatası talep oluşturmayı bozmasın */
    }
  }
  const final = await svc
    .retrieveServiceRequest((created as any).id)
    .catch(() => created)

  return res.status(201).json({ service_request: final })
}

/**
 * GET /store/service-requests
 * Giriş yapmış müşterinin kendi taleplerini döner (takip ekranı için).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id ?? null
  if (!customerId) {
    return res.json({ service_requests: [] })
  }
  const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
  const service_requests = await svc.listServiceRequests(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )
  return res.json({ service_requests })
}
