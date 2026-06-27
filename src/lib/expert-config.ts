/**
 * Hizmet sağlayıcı (inşaat mühendisi + uygulayıcı/yüklenici) ön-kayıt / dizin
 * yapılandırması — TEK KAYNAK.
 *
 * İki rol (provider_type):
 *  - engineer    = İnşaat Mühendisi (beyin): tespit / proje / danışmanlık
 *  - implementer = Uygulayıcı / Yüklenici (eller): inşaat & güçlendirmenin fiziki uygulaması
 *
 * Backend doğrulaması (store/admin route'ları) ve admin paneli bu listeyi kullanır.
 * Storefront kendi kopyasını taşır (src/lib/expert-config.ts) — cargo util deseni gibi.
 */

export type ProviderType = "engineer" | "implementer"
export const PROVIDER_TYPES: ProviderType[] = ["engineer", "implementer"]

export type ExpertSpecialization = {
  key: string
  label: string
}

/** İnşaat mühendisi (beyin) uzmanlıkları — sabit liste, serbest metin yok. */
export const ENGINEER_SPECIALIZATIONS: ExpertSpecialization[] = [
  { key: "risk_tespit", label: "Bina Risk & Hasar Tespiti" },
  { key: "guclendirme", label: "Güçlendirme Projesi (Retrofit Tasarım)" },
  { key: "statik_proje", label: "Statik / Betonarme Proje" },
  { key: "zemin_etut", label: "Zemin Etüdü & Geoteknik" },
  { key: "yapi_denetim", label: "Yapı Denetimi" },
  { key: "kentsel_donusum", label: "Kentsel Dönüşüm Danışmanlığı" },
  { key: "performans_analizi", label: "Deprem Performans Analizi" },
]

/** Uygulayıcı / yüklenici (eller) uzmanlıkları — fiziki saha uygulaması. */
export const IMPLEMENTER_SPECIALIZATIONS: ExpertSpecialization[] = [
  { key: "guclendirme_uygulama", label: "Güçlendirme Uygulaması (Retrofit)" },
  { key: "karbon_fiber", label: "Karbon Fiber / FRP Güçlendirme" },
  { key: "celik_guclendirme", label: "Çelik Güçlendirme" },
  { key: "temel_perde", label: "Temel & Perde / Mantolama Uygulaması" },
  { key: "insaat_yapim", label: "İnşaat / Kaba Yapım" },
  { key: "zemin_iyilestirme", label: "Zemin İyileştirme Uygulaması" },
  { key: "yikim_hafriyat", label: "Yıkım & Hafriyat" },
  { key: "tadilat_onarim", label: "Tadilat & Onarım" },
]

/** Backward-compat alias (eski import'lar engineer'a düşer). */
export const EXPERT_SPECIALIZATIONS = ENGINEER_SPECIALIZATIONS

export function specializationsFor(type: ProviderType): ExpertSpecialization[] {
  return type === "implementer"
    ? IMPLEMENTER_SPECIALIZATIONS
    : ENGINEER_SPECIALIZATIONS
}

export function specializationKeysFor(type: ProviderType): string[] {
  return specializationsFor(type).map((s) => s.key)
}

const ALL_SPECS = [...ENGINEER_SPECIALIZATIONS, ...IMPLEMENTER_SPECIALIZATIONS]
export const EXPERT_SPECIALIZATION_KEYS = ALL_SPECS.map((s) => s.key)

export function specializationLabel(key: string): string {
  return ALL_SPECS.find((s) => s.key === key)?.label ?? key
}

/** Ödeme isteği sinyali (discovery) — "aylık ne kadar öderdin?". */
export type ExpertBudgetTier = {
  key: string
  label: string
}

export const EXPERT_BUDGET_TIERS: ExpertBudgetTier[] = [
  { key: "unsure", label: "Henüz emin değilim" },
  { key: "0_250", label: "Aylık 0 – 250 ₺" },
  { key: "250_500", label: "Aylık 250 – 500 ₺" },
  { key: "500_1000", label: "Aylık 500 – 1.000 ₺" },
  { key: "1000_plus", label: "Aylık 1.000 ₺ +" },
]

export const EXPERT_BUDGET_KEYS = EXPERT_BUDGET_TIERS.map((b) => b.key)

export function budgetLabel(key: string): string {
  return EXPERT_BUDGET_TIERS.find((b) => b.key === key)?.label ?? key
}

/**
 * Üyelik paketi (iş modeli: komisyon/escrow YOK, üyelik temelli). Beta'da ödeme
 * alınmaz; admin manuel atar. premium = dizinde öne çıkar + "Öne Çıkan" rozeti.
 */
export type MembershipTier = "none" | "basic" | "premium"
export const MEMBERSHIP_TIERS: MembershipTier[] = ["none", "basic", "premium"]
export const MEMBERSHIP_LABELS: Record<MembershipTier, string> = {
  none: "Standart",
  basic: "Temel",
  premium: "Üst",
}
export function membershipLabel(key: string): string {
  return MEMBERSHIP_LABELS[key as MembershipTier] ?? "Standart"
}

/**
 * Hizmet bölgesi KAPSAMI üyelik paketine bağlı (Slayt 9): paket başına izin
 * verilen EK hizmet bölgesi sayısı (ana konum hariç). Beta self-servis kayıtta
 * 'basic' limiti uygulanır; admin paketi yükseltirse daha fazla bölge eklenebilir.
 */
export const MEMBERSHIP_REGION_LIMITS: Record<MembershipTier, number> = {
  none: 1,
  basic: 3,
  premium: 10,
}
export function regionLimitFor(tier: string): number {
  return MEMBERSHIP_REGION_LIMITS[tier as MembershipTier] ?? 1
}

/**
 * Belge–uzmanlık eşleşmesi (Slayt 11): hangi uzmanlık hangi belgeyi zorunlu kılar.
 * Tek kaynak; storefront kopyası src/lib/expert-config.ts ile EŞ TUTULMALI.
 */
export type DocType = "diploma" | "oda" | "yetki" | "lisans" | "diger"
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  diploma: "Diploma",
  oda: "Oda Kaydı (İMO)",
  yetki: "Yetki Belgesi / Vergi Mükellefiyeti",
  lisans: "Lisans / Ruhsat",
  diger: "Diğer Belge",
}

/** Her uzmanlık için zorunlu belge tipleri. */
export const SPEC_REQUIRED_DOCS: Record<string, DocType[]> = {
  // Mühendis (beyin): diploma + İMO oda kaydı; denetim ek ruhsat ister.
  risk_tespit: ["diploma", "oda"],
  guclendirme: ["diploma", "oda"],
  statik_proje: ["diploma", "oda"],
  zemin_etut: ["diploma", "oda"],
  yapi_denetim: ["diploma", "oda", "lisans"],
  kentsel_donusum: ["diploma", "oda"],
  performans_analizi: ["diploma", "oda"],
  // Uygulayıcı (eller): yetki belgesi / vergi mükellefiyeti; bazıları ek ruhsat.
  guclendirme_uygulama: ["yetki"],
  karbon_fiber: ["yetki"],
  celik_guclendirme: ["yetki"],
  temel_perde: ["yetki"],
  insaat_yapim: ["yetki", "lisans"],
  zemin_iyilestirme: ["yetki"],
  yikim_hafriyat: ["yetki", "lisans"],
  tadilat_onarim: ["yetki"],
}

/** Seçili uzmanlıkların gerektirdiği belge tiplerinin BİRLEŞİMİ. */
export function requiredDocsForSpecs(keys: string[]): DocType[] {
  const set = new Set<DocType>()
  for (const k of keys) (SPEC_REQUIRED_DOCS[k] || []).forEach((d) => set.add(d))
  return Array.from(set)
}
export function requiredDocLabels(keys: string[]): string[] {
  return requiredDocsForSpecs(keys).map((d) => DOC_TYPE_LABELS[d])
}
