/**
 * Satıcı paneli RBAC — tek doğruluk kaynağı (backend).
 *
 * İzin modeli: her menü BÖLÜMÜ için 3 seviye yetki:
 *   "none" → erişim yok | "view" → sadece görüntüle | "full" → tam yetki (düzenle)
 *
 * Sahip (is_owner) veya permissions === null olan kullanıcı HER bölümde "full"
 * sayılır (geriye dönük uyumluluk: mevcut tek-kullanıcılı mağazalar).
 *
 * Not: vendor paneli ayrı repo olduğundan bu dosyanın bir kopyası orada da
 * (src/lib/permissions.ts) tutulur — ikisi senkron kalmalı.
 */

export type PermLevel = "none" | "view" | "full"
export type PermissionMap = Record<string, PermLevel>

const LEVEL_RANK: Record<PermLevel, number> = { none: 0, view: 1, full: 2 }

/** Tüm izin bölümleri (menü ile birebir). `edit` = "full" seviyesi anlamlı mı. */
export const PERMISSION_SECTIONS: {
  key: string
  label: string
  edit: boolean
}[] = [
  { key: "products", label: "Ürünler", edit: true },
  { key: "orders", label: "Siparişler", edit: true },
  { key: "returns", label: "İadeler", edit: true },
  { key: "campaigns", label: "Kampanyalar & Kuponlar", edit: true },
  { key: "service_requests", label: "Hizmet Talepleri", edit: true },
  { key: "questions", label: "Sorular", edit: true },
  { key: "messages", label: "Mesajlar", edit: true },
  { key: "reviews", label: "Değerlendirmeler", edit: true },
  { key: "invoices", label: "Faturalar", edit: true },
  { key: "earnings", label: "Kazançlar", edit: false },
  { key: "performance", label: "Performans", edit: false },
  { key: "settings", label: "Mağaza Ayarları", edit: true },
  { key: "team", label: "Ekip Yönetimi", edit: true },
  { key: "audit_log", label: "Sistem Kayıtları", edit: false },
]

export const PERMISSION_KEYS = PERMISSION_SECTIONS.map((s) => s.key)

/** Hazır rol şablonları (sahip hariç). Sahip rolü atanmaz; is_owner ile gelir. */
export const ROLE_TEMPLATES: {
  key: string
  label: string
  description: string
  permissions: PermissionMap
}[] = [
  {
    key: "manager",
    label: "Müdür",
    description: "Ekip yönetimi dahil her şeye tam yetki.",
    permissions: fill("full", { audit_log: "view" }),
  },
  {
    key: "warehouse",
    label: "Depo Sorumlusu",
    description: "Ürün, sipariş (kargolama) ve iade işlemleri.",
    permissions: fill("none", {
      products: "full",
      orders: "full",
      returns: "full",
      service_requests: "full",
      performance: "view",
    }),
  },
  {
    key: "accounting",
    label: "Muhasebe",
    description: "Kazanç, fatura ve sipariş görüntüleme + sistem kayıtları.",
    permissions: fill("none", {
      earnings: "view",
      invoices: "full",
      orders: "view",
      returns: "view",
      performance: "view",
      audit_log: "view",
    }),
  },
  {
    key: "sales",
    label: "Satış & Pazarlama",
    description: "Ürün, kampanya, soru, mesaj ve değerlendirme yönetimi.",
    permissions: fill("none", {
      products: "full",
      campaigns: "full",
      questions: "full",
      messages: "full",
      reviews: "full",
      performance: "view",
    }),
  },
  {
    key: "support",
    label: "Müşteri Hizmetleri",
    description: "Soru, mesaj, iade ve değerlendirme; sipariş görüntüleme.",
    permissions: fill("none", {
      questions: "full",
      messages: "full",
      returns: "full",
      reviews: "full",
      orders: "view",
      performance: "view",
    }),
  },
  {
    key: "custom",
    label: "Özel",
    description: "İzinleri tek tek seç.",
    permissions: fill("none"),
  },
]

/** Tüm bölümleri `base` ile doldurur, `overrides` ile ezer. */
function fill(base: PermLevel, overrides: PermissionMap = {}): PermissionMap {
  const out: PermissionMap = {}
  for (const k of PERMISSION_SECTIONS.map((s) => s.key)) out[k] = base
  return { ...out, ...overrides }
}

/** Bir bölümün etkin yetki seviyesi (sahip/null → her zaman "full"). */
export function levelFor(
  admin: { is_owner?: boolean; permissions?: PermissionMap | null } | null | undefined,
  section: string
): PermLevel {
  if (!admin) return "none"
  if (admin.is_owner || admin.permissions == null) return "full"
  return (admin.permissions[section] as PermLevel) || "none"
}

/** admin, section üzerinde en az `min` seviyesinde yetkili mi. */
export function can(
  admin: { is_owner?: boolean; permissions?: PermissionMap | null } | null | undefined,
  section: string,
  min: PermLevel = "view"
): boolean {
  return LEVEL_RANK[levelFor(admin, section)] >= LEVEL_RANK[min]
}

// ── /vendors route → izin haritası ─────────────────────────────────────────
// /vendors/<segment>/... yolunun ilk segmentine göre gerekli bölüm bulunur.
// `always` true ise izin kontrolü atlanır (panel açılışı/zorunlu akışlar).
const SEGMENT_PERMISSION: Record<string, { section?: string; always?: boolean }> = {
  // Panel açılışı / her kullanıcıya açık olması gereken uçlar:
  me: { always: true }, // GET her zaman; POST (ayar) ayrıca settings:full istenir (aşağıda)
  stats: { always: true },
  notifications: { always: true },
  contracts: { always: true }, // zorunlu sözleşme kabulü role bağlı değildir
  scorecard: { section: "performance" },
  analytics: { section: "performance" },
  // Form referans verileri (ürün/kampanya formları okur) — yazma yok, serbest:
  categories: { always: true },
  brands: { always: true },
  "category-attributes": { always: true },
  "showcase-categories": { always: true }, // sabit vitrin etiketleri (form referansı)
  uploads: { always: true }, // genel görsel yükleme; iş etkisi yok
  "suggest-category": { section: "products" },
  "generate-listing": { section: "products" },
  "generate-block-text": { section: "products" },
  // İş bölümleri:
  products: { section: "products" },
  orders: { section: "orders" },
  returns: { section: "returns" },
  campaigns: { section: "campaigns" },
  "service-requests": { section: "service_requests" },
  questions: { section: "questions" },
  conversations: { section: "messages" },
  reviews: { section: "reviews" },
  invoices: { section: "invoices" },
  earnings: { section: "earnings" },
  team: { section: "team" },
  "audit-logs": { section: "audit_log" },
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Bir /vendors isteği için gereken izni döndürür.
 * `null` → kontrol atlanır (serbest). Aksi halde { section, level }.
 */
export function requiredPermissionFor(
  method: string,
  path: string
): { section: string; level: PermLevel } | null {
  // /vendors veya /vendors/ → kayıt akışı, kontrol yok.
  const m = path.match(/\/vendors\/([^/?]+)/)
  if (!m) return null
  const segment = decodeURIComponent(m[1])
  const entry = SEGMENT_PERMISSION[segment]

  const isRead = READ_METHODS.has(method.toUpperCase())

  // me: GET serbest, POST → mağaza ayarı düzenleme.
  if (segment === "me") {
    return isRead ? null : { section: "settings", level: "full" }
  }
  if (!entry) {
    // Bilinmeyen uç: yazma ise reddetmeyelim ama en azından oturum gerekli
    // (authenticate zaten yapıyor); bölüm eşlemesi yoksa serbest bırak.
    return null
  }
  if (entry.always) return null
  const section = entry.section!
  return { section, level: isRead ? "view" : "full" }
}
