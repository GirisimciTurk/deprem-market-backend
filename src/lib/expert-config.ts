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
