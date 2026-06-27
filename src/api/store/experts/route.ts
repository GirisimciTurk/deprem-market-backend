import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { EXPERT_LEAD_MODULE } from "../../../modules/expert_lead"
import ExpertLeadModuleService from "../../../modules/expert_lead/service"

/**
 * Herkese açık dizin DTO'su — yayınlanmış (status=approved + is_published) profillerin
 * YALNIZCA güvenli alanlarını döner. İletişim bilgisi sağlayıcının show_* tercihine bağlı;
 * belge URL'leri, iç not, bütçe sinyali ve ham e-posta/telefon ASLA dışarı verilmez.
 */
/** Doğrulanmış uzmanlıklar (legacy null → tümü doğrulanmış sayılır). */
export function verifiedSpecsOf(l: any): string[] {
  if (Array.isArray(l.verified_specializations)) return l.verified_specializations
  return Array.isArray(l.specializations) ? l.specializations : []
}

export function toPublic(l: any) {
  const docs = Array.isArray(l.documents) ? l.documents : []
  return {
    slug: l.slug,
    provider_type: l.provider_type,
    full_name: l.full_name,
    title: l.title || "",
    city: l.city || "",
    district: l.district || "",
    specializations: Array.isArray(l.specializations) ? l.specializations : [],
    // Uzmanlık bazında onay: yalnız doğrulanmış uzmanlıklar (dizin filtresi bunları kullanır).
    verified_specializations: verifiedSpecsOf(l),
    experience_years: l.experience_years ?? null,
    imo_member: !!l.imo_member,
    service_areas: l.service_areas || "",
    service_regions: Array.isArray(l.service_regions) ? l.service_regions : [],
    about: l.about || "",
    photo_url: l.photo_url || "",
    // "Doğrulanmış" rozeti yayınlanmış olmaya bağlı; belge SAYISI bilgi amaçlı,
    // URL paylaşılmaz (gizlilik).
    verified: true,
    document_count: docs.length,
    membership_tier: l.membership_tier || "none",
    featured: l.membership_tier === "premium",
    // İletişim — yalnız sağlayıcının açtığı kanallar.
    phone: l.show_phone ? l.phone || "" : "",
    email: l.show_email ? l.email || "" : "",
    whatsapp: l.whatsapp || "",
    published_at: l.published_at,
  }
}

/**
 * GET /store/experts?type=&city=&district=&specialization=&q=&limit=&offset=
 * Yayınlanmış (doğrulanmış) uzman & uygulayıcı dizini — herkese açık.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const providerType = req.query.type as string | undefined
  const city = (req.query.city as string | undefined)?.trim()
  const district = (req.query.district as string | undefined)?.trim()
  const specialization = (req.query.specialization as string | undefined)?.trim()
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {
    status: "approved",
    is_published: true,
  }
  if (providerType && ["engineer", "implementer"].includes(providerType)) {
    filters.provider_type = providerType
  }
  // city/district DB'de filtrelenmez; ana konum VE ek hizmet bölgeleri (jsonb)
  // üzerinde bellekte eşlenir (uzman birden fazla bölgeye hizmet verebilir).
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { full_name: { $ilike: like } },
      { title: { $ilike: like } },
      { about: { $ilike: like } },
    ]
  }

  const service: ExpertLeadModuleService = req.scope.resolve(EXPERT_LEAD_MODULE)
  // city/district/specialization bellekte eşlendiğinden, bunlar aktifse geniş bir
  // pencere çekip bellekte sayfala; aksi halde DB sayfalaması yeterli.
  const memFilter = !!(city || district || specialization)
  const [leads, count] = await service.listAndCountExpertLeads(filters, {
    order: { published_at: "DESC" },
    skip: memFilter ? 0 : offset,
    take: memFilter ? 200 : limit,
  })

  const norm = (s: any) => String(s || "").toLocaleLowerCase("tr")
  const locStrings = (l: any) => {
    const arr: string[] = [l.city, l.district]
    if (Array.isArray(l.service_regions)) {
      for (const r of l.service_regions) arr.push(r?.city, r?.district)
    }
    return arr.filter(Boolean).map(norm)
  }

  let items = leads as any[]
  if (specialization) {
    // Uzmanlık bazında onay: filtre yalnız DOĞRULANMIŞ uzmanlıkla eşleşir.
    items = items.filter((l) => verifiedSpecsOf(l).includes(specialization))
  }
  // Konum: ana konum VEYA ek hizmet bölgelerinden biri eşleşmeli.
  if (city) items = items.filter((l) => locStrings(l).some((s) => s.includes(norm(city))))
  if (district) items = items.filter((l) => locStrings(l).some((s) => s.includes(norm(district))))

  // Premium (Üst paket) profilleri öne al; eşitlikte published_at DESC korunur (kararlı sort).
  items = [...items].sort(
    (a, b) =>
      (a.membership_tier === "premium" ? 0 : 1) -
      (b.membership_tier === "premium" ? 0 : 1)
  )

  const total = memFilter ? items.length : count
  const page = memFilter ? items.slice(offset, offset + limit) : items
  return res.json({
    experts: page.map(toPublic),
    count: total,
    offset,
    limit,
  })
}
