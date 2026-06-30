import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"
import { isLlmEnabled, assistAgent, type AgentNavOption } from "../../../lib/llm"

const bodySchema = z.object({
  // Kullanıcının yeni mesajı.
  message: z.string().trim().min(1).max(800),
  // Kısa konuşma geçmişi (son birkaç tur) — bağlam için.
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      })
    )
    .max(20)
    .optional(),
  // Kullanıcının bulunduğu sayfa (countryCode'suz slug, bağlam için).
  path: z.string().trim().max(200).optional(),
})

/**
 * İzinli yönlendirme hedefleri — storefront'ta GERÇEKTEN var olan sayfalar.
 * Model navigate_path'i SADECE bu slug'lardan seçebilir (LLM şema enum'ı + doğrulama).
 * Storefront `/${countryCode}/${slug}` olarak yönlendirir; "" = ana sayfa.
 */
const NAV_OPTIONS: AgentNavOption[] = [
  { path: "home", label: "Ana sayfa" },
  { path: "store", label: "Mağaza — tüm ürünler" },
  { path: "kategoriler", label: "Kategoriler" },
  { path: "hazirlik-asistani", label: "Deprem Hazırlık & Güvenlik Asistanı (detaylı set önerici)" },
  { path: "hizmetler/karbon-fiber", label: "Karbon Fiber Güçlendirme & Keşif Hizmeti" },
  { path: "blog", label: "Blog / Deprem hazırlık rehberleri" },
  { path: "uzmanlar", label: "Uzmanlar — inşaat mühendisi/uygulayıcı dizini" },
  { path: "sikca-sorulan-sorular", label: "Sıkça Sorulan Sorular" },
  { path: "iletisim", label: "İletişim" },
  { path: "hakkimizda", label: "Hakkımızda" },
  { path: "siparis-takip", label: "Sipariş Takibi" },
  { path: "favorilerim", label: "Favorilerim" },
  { path: "cart", label: "Sepet" },
  { path: "account", label: "Hesabım" },
]

/**
 * POST /store/assistant  { message, history?, path? }
 *
 * Maskot "Depremzede" — siteyi süren konuşkan AI asistanı. Kullanıcının mesajını
 * sınıflandırır ve şunları döndürür: konuşma yanıtı (reply), gidilecek sayfa
 * (navigate_path), açılacak ürün (open_product_id), önerilen ürün/set kartları
 * (products) ve yapısal güvenlik durumunda uzman keşfi bayrağı.
 *
 * product_id / navigate_path GERÇEK kataloğa ve izinli sayfalara kısıtlıdır (LLM şema
 * enum'ı + sunucu doğrulaması) → uydurma ürün/sayfa imkânsız. AI kapalı/hata → güvenli
 * sabit yanıt (fail-open). Publishable key zorunludur.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz istek.", issues: parsed.error.issues })
  }

  const fallback = (extra: Record<string, unknown> = {}) => ({
    reply: "",
    navigate_path: "",
    open_product_id: "",
    products: [] as unknown[],
    add_all_to_cart: false,
    recommend_survey: false,
    survey_reason: "",
    ...extra,
  })

  if (!isLlmEnabled()) {
    // navigate_path boş bırakılır → kullanıcıyı OTOMATİK mağazaya fırlatma (özellikle
    // ilk mesajı bir güvenlik sorusuysa şaşırtıcı olur); yine de metinde yönlendiririz.
    return res.json(
      fallback({
        reply:
          "Şu an akıllı asistan kapalı, ama mağazaya göz atarak deprem hazırlık ürünlerini bulabilirsin.",
        disabled: true,
      })
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "categories.name"],
    filters: { status: "published" },
    pagination: { take: 300 },
  })

  const list = ((products as any[] | undefined) ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    category: (p.categories?.[0]?.name as string) || "",
  }))
  if (list.length === 0) {
    return res.json(
      fallback({
        reply: "Henüz yayında ürün yok gibi görünüyor. Birazdan tekrar dener misin?",
      })
    )
  }

  const out = await assistAgent({
    message: parsed.data.message,
    history: parsed.data.history,
    currentPath: parsed.data.path,
    products: list,
    navOptions: NAV_OPTIONS,
  })
  if (!out.ok) {
    // Ayrıntılı hatayı yalnız sunucuda logla; istemciye ham sağlayıcı hata metnini
    // (Gemini gövdesi/parça çıktısı içerebilir) YANSITMA — kaba bir kod döndür.
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger?.warn?.(`[/store/assistant] asistan hatası: ${out.error}`)
    // navigate_path boş → otomatik yönlendirme yok (fallback varsayılanı).
    return res.json(
      fallback({
        reply: "Şu an sana tam yardımcı olamadım. İstersen mağazadan ürünlere göz atabilirsin.",
        error: "assistant_unavailable",
      })
    )
  }

  return res.json(out.data)
}
