import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { EXPERT_LEAD_MODULE } from "../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../modules/expert_lead/service"
import { expertLeadLimiter, enforceRateLimit } from "../../../lib/rate-limiter"
import { notifyAdmins } from "../../../lib/notify"
import { sendExpertLeadConfirmation } from "../../../lib/expert-mail"
import {
  EXPERT_SPECIALIZATION_KEYS,
  EXPERT_BUDGET_KEYS,
  PROVIDER_TYPES,
  specializationKeysFor,
} from "../../../lib/expert-config"

const schema = z
  .object({
    provider_type: z.enum(PROVIDER_TYPES as [string, ...string[]]).optional(),
    full_name: z.string().min(1, "Ad soyad zorunlu"),
    title: z.string().optional(),
    email: z.string().email("Geçerli bir e-posta girin"),
    phone: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    specializations: z
      .array(z.enum(EXPERT_SPECIALIZATION_KEYS as [string, ...string[]]))
      .min(1, "En az bir uzmanlık alanı seçin"),
    experience_years: z.coerce.number().int().min(0).max(70).optional(),
    imo_member: z.boolean().optional(),
    service_areas: z.string().optional(),
    budget_tier: z.enum(EXPERT_BUDGET_KEYS as [string, ...string[]]).optional(),
    message: z.string().optional(),
    // --- Dizin profili (opsiyonel; admin doğrulayıp yayınlayınca /uzmanlar'da görünür) ---
    about: z.string().max(2000).optional(),
    whatsapp: z.string().max(30).optional(),
    show_phone: z.boolean().optional(),
    show_email: z.boolean().optional(),
    // Doğrulama belgeleri — /store/expert-uploads'tan dönen URL'ler.
    documents: z
      .array(
        z.object({
          type: z.enum(["diploma", "oda", "yetki", "lisans", "diger"]).default("diger"),
          url: z.string().url(),
          name: z.string().max(200).optional(),
        })
      )
      .max(5)
      .optional(),
  })
  // Seçilen uzmanlıklar, rolün (engineer/implementer) kendi listesine ait olmalı.
  .refine(
    (d) => {
      const allowed = specializationKeysFor(
        (d.provider_type ?? "engineer") as "engineer" | "implementer"
      )
      return d.specializations.every((s) => allowed.includes(s))
    },
    { message: "Uzmanlık alanları seçilen rol ile uyumlu değil.", path: ["specializations"] }
  )

/** POST /store/expert-leads — herkese açık uzman (mühendis) ön-kayıt / ilgi formu. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(expertLeadLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Geçersiz başvuru.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)

  const lead = await service.createExpertLeads({
    provider_type: (d.provider_type ?? "engineer") as "engineer" | "implementer",
    full_name: d.full_name,
    title: d.title ?? "",
    email: d.email,
    phone: d.phone ?? "",
    city: d.city ?? "",
    district: d.district ?? "",
    specializations: d.specializations as any,
    experience_years: d.experience_years ?? null,
    imo_member: d.imo_member ?? false,
    service_areas: d.service_areas ?? "",
    budget_tier: d.budget_tier ?? "",
    message: d.message ?? "",
    about: d.about ?? "",
    whatsapp: d.whatsapp ?? "",
    show_phone: d.show_phone ?? true,
    show_email: d.show_email ?? false,
    documents: (d.documents ?? null) as any,
    status: "new",
  })

  const roleLabel = (d.provider_type ?? "engineer") === "implementer" ? "uygulayıcı" : "mühendis"
  await notifyAdmins(req.scope, {
    type: "expert_lead",
    title: `Yeni ${roleLabel} ön kaydı`,
    body: `${d.full_name}${d.city ? ` — ${d.city}` : ""}`,
    link: "/expert-leads",
  })

  // Onay maili (mail hatası başvuru akışını bozmasın).
  try {
    await sendExpertLeadConfirmation(req.scope, lead as any)
  } catch (e: any) {
    req.scope
      .resolve("logger")
      .error(`[expert-leads] Onay maili gönderilemedi: ${e?.message}`)
  }

  return res.status(201).json({ lead: { id: lead.id, status: lead.status } })
}
