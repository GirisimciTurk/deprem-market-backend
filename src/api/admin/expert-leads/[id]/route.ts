import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { EXPERT_LEAD_MODULE } from "../../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../../modules/expert_lead/service"
import {
  PROVIDER_TYPES,
  specializationKeysFor,
} from "../../../../lib/expert-config"

const docSchema = z.object({
  type: z.enum(["diploma", "oda", "yetki", "lisans", "diger"]).default("diger"),
  url: z.string().url(),
  name: z.string().max(200).optional(),
})

const updateSchema = z.object({
  status: z.enum(["new", "contacted", "approved", "archived"]).optional(),
  notes: z.string().optional(),
  // Kimlik / iletişim (admin düzeltebilir)
  full_name: z.string().min(1).optional(),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  provider_type: z.enum(PROVIDER_TYPES as [string, ...string[]]).optional(),
  specializations: z.array(z.string()).optional(),
  experience_years: z.coerce.number().int().min(0).max(70).nullable().optional(),
  imo_member: z.boolean().optional(),
  service_areas: z.string().optional(),
  // Dizin profili
  about: z.string().max(2000).optional(),
  photo_url: z.string().optional(),
  whatsapp: z.string().max(30).optional(),
  show_phone: z.boolean().optional(),
  show_email: z.boolean().optional(),
  documents: z.array(docSchema).max(10).optional(),
  slug: z.string().max(120).optional(),
  is_published: z.boolean().optional(),
})

/** Türkçe-duyarlı slug. */
function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
  }
  return input
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] || c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

/** Benzersiz slug üret (çakışırsa -2, -3 ekler). */
async function uniqueSlug(
  service: ExpertLeadModuleService,
  base: string,
  selfId: string
): Promise<string> {
  const root = slugify(base) || "uzman"
  let candidate = root
  for (let i = 2; i < 100; i++) {
    const existing = await service.listExpertLeads({ slug: candidate }, { take: 1 })
    if (!existing.length || existing[0].id === selfId) return candidate
    candidate = `${root}-${i}`
  }
  return `${root}-${selfId.slice(-6)}`
}

/** POST /admin/expert-leads/:id — durum / iç not / dizin profili güncelle + yayınla. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz veri.", issues: parsed.error.issues })
  }
  const d = parsed.data
  if (Object.keys(d).length === 0) {
    return res.status(400).json({ message: "Güncellenecek alan yok." })
  }

  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  const current = await service.retrieveExpertLead(req.params.id)

  // Uzmanlık-rol uyumu (rol veya uzmanlık değişiyorsa doğrula).
  if (d.specializations) {
    const ptype = (d.provider_type ?? current.provider_type) as
      | "engineer"
      | "implementer"
    const allowed = specializationKeysFor(ptype)
    if (!d.specializations.every((s) => allowed.includes(s))) {
      return res
        .status(400)
        .json({ message: "Uzmanlık alanları seçilen rol ile uyumlu değil." })
    }
  }

  const update: Record<string, unknown> = { id: req.params.id }
  const direct = [
    "status", "notes", "full_name", "title", "email", "phone", "city",
    "district", "provider_type", "experience_years", "imo_member",
    "service_areas", "about", "photo_url", "whatsapp", "show_phone", "show_email",
  ] as const
  for (const k of direct) {
    if (d[k] !== undefined) update[k] = d[k]
  }
  if (d.specializations !== undefined) update.specializations = d.specializations as any
  if (d.documents !== undefined) update.documents = d.documents as any

  // Yayınlama mantığı.
  if (d.is_published !== undefined) {
    update.is_published = d.is_published
    if (d.is_published) {
      // Yayınlamak onaylamayı ima eder.
      if ((d.status ?? current.status) !== "approved") update.status = "approved"
      if (!current.published_at) update.published_at = new Date()
      // Slug yoksa üret.
      const name = (d.full_name ?? current.full_name) || ""
      const city = (d.city ?? current.city) || ""
      if (d.slug) {
        update.slug = await uniqueSlug(service, d.slug, req.params.id)
      } else if (!current.slug) {
        update.slug = await uniqueSlug(service, `${name}-${city}`, req.params.id)
      }
    }
  } else if (d.slug !== undefined) {
    update.slug = await uniqueSlug(service, d.slug, req.params.id)
  }

  const lead = await service.updateExpertLeads(update as any)
  return res.json({ lead })
}

/** DELETE /admin/expert-leads/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  await service.deleteExpertLeads(req.params.id)
  return res.json({ id: req.params.id, object: "expert_lead", deleted: true })
}
