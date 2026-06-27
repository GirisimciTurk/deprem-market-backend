import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { EXPERT_LEAD_MODULE } from "../../../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../../../modules/expert_lead/service"
import { expertRequestLimiter, enforceRateLimit } from "../../../../../lib/rate-limiter"
import { notifyAdmins } from "../../../../../lib/notify"
import { sendExpertRequestToProvider } from "../../../../../lib/expert-mail"

const schema = z.object({
  customer_name: z.string().min(1, "Ad soyad zorunlu").max(120),
  customer_phone: z.string().min(1, "Telefon zorunlu").max(30),
  customer_email: z.string().email("Geçerli bir e-posta girin").optional().or(z.literal("")),
  city: z.string().max(80).optional(),
  topic: z.string().max(160).optional(),
  message: z.string().max(2000).optional(),
})

/**
 * POST /store/experts/:slug/requests — herkese açık "Talep Bırak".
 * Ziyaretçi, sağlayıcının iletişimini görmese bile talebini bırakır; talep
 * sağlayıcıya e-posta ile iletilir + admin bildirimi düşer. Yarı-aktif lead.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(expertRequestLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Geçersiz talep.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)

  // Hedef profil yayınlanmış olmalı (gizli/taslak profile talep bırakılamaz).
  const [expert] = await service.listExpertLeads(
    { slug: req.params.slug, status: "approved", is_published: true },
    { take: 1 }
  )
  if (!expert) {
    return res.status(404).json({ message: "Profil bulunamadı." })
  }

  const request = await service.createExpertRequests({
    expert_id: expert.id,
    expert_slug: expert.slug ?? "",
    expert_name: expert.full_name,
    customer_name: d.customer_name,
    customer_phone: d.customer_phone,
    customer_email: d.customer_email || "",
    city: d.city ?? "",
    topic: d.topic ?? "",
    message: d.message ?? "",
    status: "new",
  })

  await notifyAdmins(req.scope, {
    type: "expert_request",
    title: "Yeni hizmet talebi",
    body: `${d.customer_name} → ${expert.full_name}`,
    link: "/expert-requests",
  })

  // Talebi sağlayıcıya ilet (mail hatası akışı bozmasın).
  try {
    await sendExpertRequestToProvider(req.scope, {
      requestId: request.id,
      providerEmail: expert.email,
      providerName: expert.full_name,
      customerName: d.customer_name,
      customerPhone: d.customer_phone,
      customerEmail: d.customer_email || "",
      city: d.city,
      topic: d.topic,
      message: d.message,
    })
  } catch (e: any) {
    req.scope
      .resolve("logger")
      .error(`[expert-requests] Talep maili gönderilemedi: ${e?.message}`)
  }

  return res.status(201).json({ request: { id: request.id, status: request.status } })
}
