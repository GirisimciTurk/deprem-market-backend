/**
 * AI moderasyon/üretim yardımcıları — uygulamanın kullandığı sağlayıcı-bağımsız yüzey.
 * Eşik bazlı otonomi: yüksek güvenli kararlar otomatik uygulanır, gerisi admin kuyruğuna.
 */
import { geminiGenerate, isLlmEnabled, type LlmImage } from "./client"

export { isLlmEnabled, type LlmImage }

/** LLM kararı. confidence 0..1. */
export type AiVerdict = {
  verdict: "approve" | "reject" | "review"
  confidence: number
  reason: string
}

/** Eşik sonrası uygulanacak eylem. */
export type AiAction = "auto_approve" | "auto_reject" | "needs_review"

export type VerdictOutcome =
  | ({ ok: true; action: AiAction } & AiVerdict)
  | { ok: false; error: string }

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["approve", "reject", "review"] },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
  required: ["verdict", "confidence", "reason"],
} as const

function approveThreshold(): number {
  return Number(process.env.AI_AUTO_APPROVE_THRESHOLD ?? 0.85)
}
function rejectThreshold(): number {
  return Number(process.env.AI_AUTO_REJECT_THRESHOLD ?? 0.9)
}

/**
 * Karar + güven skorunu eşiklerle eyleme çevirir. Red daha riskli olduğu için
 * daha yüksek güven ister; eşiğin altındaki her şey insana (needs_review) gider.
 */
export function decideAction(v: AiVerdict): AiAction {
  const conf = Number(v.confidence) || 0
  if (v.verdict === "approve" && conf >= approveThreshold()) return "auto_approve"
  if (v.verdict === "reject" && conf >= rejectThreshold()) return "auto_reject"
  return "needs_review"
}

/** verdict şemalı bir Gemini çağrısı yapıp eşik eylemini ekler. */
async function runVerdict(
  system: string,
  userText: string,
  images?: LlmImage[]
): Promise<VerdictOutcome> {
  const res = await geminiGenerate<AiVerdict>({
    system,
    userText,
    images,
    jsonSchema: VERDICT_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const v = res.data
  if (!v || typeof v.verdict !== "string") return { ok: false, error: "Geçersiz karar yapısı" }
  const confidence = Math.max(0, Math.min(1, Number(v.confidence) || 0))
  const verdict: AiVerdict = { verdict: v.verdict, confidence, reason: String(v.reason ?? "") }
  return { ok: true, ...verdict, action: decideAction(verdict) }
}

// ─────────────────────────── Görev 1: Yorum moderasyonu ───────────────────────────

export async function moderateReview(input: {
  comment: string
  rating?: number | null
  productTitle?: string | null
}): Promise<VerdictOutcome> {
  const system =
    "Sen bir Türkçe e-ticaret yorum moderatörüsün. Müşteri ürün yorumunu değerlendir. " +
    "REJECT: küfür/hakaret, spam/reklam, link, alakasız içerik, kişisel veri (telefon/adres), nefret söylemi. " +
    "APPROVE: ürünle ilgili (olumlu ya da olumsuz) yapıcı, uygun yorumlar — olumsuz yorum tek başına red sebebi DEĞİLDİR. " +
    "Emin değilsen 'review' de. confidence 0-1 arası gerçekçi olsun. reason Türkçe ve kısa."
  const userText =
    `Ürün: ${input.productTitle ?? "(bilinmiyor)"}\n` +
    `Puan: ${input.rating ?? "(yok)"}/5\n` +
    `Yorum: """${input.comment}"""`
  return runVerdict(system, userText)
}

// ─────────────────────────── Görev 2: Foto moderasyonu (vision) ───────────────────────────

export async function moderateImage(input: {
  images: LlmImage[]
  context?: string
}): Promise<VerdictOutcome> {
  const system =
    "Sen bir görsel moderatörüsün. Görseli e-ticaret platformu için değerlendir. " +
    "REJECT: müstehcen/cinsel içerik, şiddet/kan, nefret sembolleri, alakasız/spam görsel, kişisel kimlik belgesi. " +
    "APPROVE: ürün, paket, kullanım, fatura gibi platforma uygun görseller. " +
    "Emin değilsen 'review'. confidence 0-1. reason Türkçe ve kısa."
  const userText = input.context
    ? `Bağlam: ${input.context}\nGörseli değerlendir.`
    : "Görseli platforma uygunluk açısından değerlendir."
  return runVerdict(system, userText, input.images)
}

// ─────────────────────────── Görev 3: Ürün onayı ───────────────────────────

export async function reviewProduct(input: {
  title: string
  description?: string | null
  price?: number | null
  category?: string | null
  brand?: string | null
}): Promise<VerdictOutcome> {
  const system =
    "Sen bir pazaryeri ürün onay uzmanısın. Satıcının eklediği ürün ilanını POLİTİKA açısından değerlendir. " +
    "REJECT (yalnızca gerçek ihlaller): yasadışı/yasaklı ürün, sahte/taklit/replika marka, küfür/spam/reklam başlık, " +
    "açıkça yanıltıcı iddia, açıkça saçma fiyat (0 veya absürt). " +
    "APPROVE: meşru, yasal, anlaşılır ürünler. " +
    "ÖNEMLİ: Açıklamanın veya kategorinin BOŞ/EKSİK olması RED ya da sorun sebebi DEĞİLDİR — bu bilgiler sistem " +
    "tarafından otomatik tamamlanır; eksik içeriği görmezden gel, yalnız ürünün kendisi politikaya uygun mu ona bak. " +
    "Gerçekten emin olmadığın sınırda durumlar için 'review'. confidence 0-1. reason Türkçe ve kısa."
  const userText =
    `Başlık: ${input.title}\n` +
    `Kategori: ${input.category ?? "(yok)"}\n` +
    `Marka: ${input.brand ?? "(yok)"}\n` +
    `Fiyat: ${input.price ?? "(yok)"} TL\n` +
    `Açıklama: ${input.description ?? "(yok)"}`
  return runVerdict(system, userText)
}

// ─────────────────────────── Görev 4: Ürün bilgisi doldurma (üretken) ───────────────────────────

export type GeneratedProductInfo = {
  description: string
  bullet_points: string[]
  tags: string[]
  suggested_category: string
}

const PRODUCT_INFO_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    bullet_points: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    suggested_category: { type: "string" },
  },
  required: ["description", "bullet_points", "tags", "suggested_category"],
} as const

export async function generateProductInfo(input: {
  title: string
  category?: string | null
  brand?: string | null
  images?: LlmImage[]
}): Promise<{ ok: true; data: GeneratedProductInfo } | { ok: false; error: string }> {
  const system =
    "Sen bir Türkçe e-ticaret içerik editörüsün. Verilen ürün başlığından (ve varsa görselden) " +
    "satış odaklı ama dürüst içerik üret. Uydurma teknik özellik EKLEME; emin olmadığın detayı yazma. " +
    "description: 2-4 cümle akıcı Türkçe. bullet_points: 3-6 kısa madde. tags: 3-8 arama etiketi. " +
    "suggested_category: tek bir kategori adı."
  const userText =
    `Başlık: ${input.title}\n` +
    `Mevcut kategori: ${input.category ?? "(yok)"}\n` +
    `Marka: ${input.brand ?? "(yok)"}`
  const res = await geminiGenerate<GeneratedProductInfo>({
    system,
    userText,
    images: input.images,
    jsonSchema: PRODUCT_INFO_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.4,
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, data: res.data }
}

// ─────────────────────────── Görev 4b: İçerik bloğu metni (görsel anlatımı) ───────────────────────────

/**
 * Ürün sayfasındaki bir İÇERİK BLOĞU (foto + yazı) için, verilen GÖRSELİ (vision) ve
 * ürün başlığını anlatan akıcı, satış odaklı ama dürüst bir paragraf üretir. Satıcı
 * "AI ile Doldur" ile çağırır, çıktıyı DÜZENLEYEBİLİR. Uydurma özellik/ölçü eklemez.
 */
export async function generateBlockText(input: {
  title?: string | null
  brand?: string | null
  /** Editörün mevcut metni / yönlendirme ipucu (varsa) — üreteceği metne bağlam. */
  hint?: string | null
  images?: LlmImage[]
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const system =
    "Sen bir Türkçe e-ticaret içerik editörüsün. Ürün sayfasındaki bir İÇERİK BLOĞU için, " +
    "verilen GÖRSELİ (varsa) ve ürün başlığını temel alan, satış odaklı ama DÜRÜST, akıcı bir " +
    "paragraf yaz. Görselde ne görünüyorsa onu ürün bağlamında anlat. Uydurma teknik özellik, " +
    "ölçü, malzeme veya iddia EKLEME; emin olmadığın detayı yazma. 2-4 cümle, Türkçe, en fazla " +
    "~480 karakter. SADECE paragraf metnini döndür — başlık, tırnak veya madde işareti EKLEME."
  const userText =
    `Ürün başlığı: ${input.title ?? "(belirtilmedi)"}\n` +
    `Marka: ${input.brand ?? "(yok)"}\n` +
    (input.hint ? `Editörün notu/ipucu: ${input.hint}\n` : "") +
    `Bu blok için görseli/ürünü anlatan paragrafı yaz.`
  const res = await geminiGenerate<string>({
    system,
    userText,
    images: input.images,
    temperature: 0.5,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const text = (res.data || "").toString().trim()
  if (!text) return { ok: false, error: "Boş metin" }
  return { ok: true, text }
}

// ─────────────────────────── Görev 5: Kategori önerisi (sınıflandırma) ───────────────────────────

/** Satıcının ürünü için MEVCUT listeden önerilen kategori. category_id daima listede. */
export type CategorySuggestion = {
  category_id: string
  confidence: number
  reason: string
  alternates: string[]
}

/**
 * Ürün başlığı/açıklamasından, VERİLEN gerçek kategori listesinden en uygun
 * kategoriyi seçer. Çıktı `category_id` (ve alternatifler) JSON şema `enum`'ı ile
 * listedeki id'lere KISITLANIR → model liste dışı kategori uyduramaz. Ek doğrulama
 * olarak dönen id listede mi diye kontrol edilir (fail-closed).
 */
export async function suggestProductCategory(input: {
  title: string
  description?: string | null
  categories: { id: string; path: string }[]
}): Promise<{ ok: true; data: CategorySuggestion } | { ok: false; error: string }> {
  const cats = (input.categories ?? []).filter((c) => c?.id && c?.path)
  if (cats.length === 0) return { ok: false, error: "Kategori listesi boş" }
  const ids = cats.map((c) => c.id)

  const schema = {
    type: "object",
    properties: {
      category_id: { type: "string", enum: ids },
      confidence: { type: "number" },
      reason: { type: "string" },
      alternates: { type: "array", items: { type: "string", enum: ids } },
    },
    required: ["category_id", "confidence", "reason", "alternates"],
  } as const

  const system =
    "Sen bir Türkçe pazaryeri kategori sınıflandırma uzmanısın. Verilen ürün için AŞAĞIDAKİ " +
    "LİSTEDEN en uygun kategoriyi seç. SADECE listedeki id'lerden birini döndür; liste dışı " +
    "kategori UYDURMA. category_id: en uygun kategorinin id'si. alternates: 0-2 makul alternatif " +
    "kategori id'si (en uygundan sonra, gerçekten uygunsa). confidence: 0-1 arası gerçekçi güven " +
    "(emin değilsen düşük tut). reason: neden bu kategori, tek kısa Türkçe cümle."
  const list = cats.map((c) => `${c.id} — ${c.path}`).join("\n")
  const userText =
    `Ürün başlığı: ${input.title}\n` +
    (input.description ? `Açıklama: ${input.description}\n` : "") +
    `\nKategoriler (id — yol):\n${list}`

  const res = await geminiGenerate<CategorySuggestion>({
    system,
    userText,
    jsonSchema: schema as unknown as Record<string, unknown>,
    temperature: 0,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const d = res.data
  if (!d || typeof d.category_id !== "string" || !ids.includes(d.category_id)) {
    return { ok: false, error: "Geçersiz kategori önerisi" }
  }
  const confidence = Math.max(0, Math.min(1, Number(d.confidence) || 0))
  const alternates = Array.isArray(d.alternates)
    ? d.alternates.filter((a) => ids.includes(a) && a !== d.category_id).slice(0, 2)
    : []
  return { ok: true, data: { category_id: d.category_id, confidence, reason: String(d.reason ?? ""), alternates } }
}

// ─────────────────────────── Görev 6: Deprem hazırlık seti önerisi ───────────────────────────

export type KitItem = { product_id: string; quantity: number; reason: string }
export type PreparednessKit = { items: KitItem[]; summary: string }

/**
 * Müşterinin serbest-metin ihtiyacından (ör. "2 kişilik ev + 1 bebek, 3 gün") VERİLEN
 * gerçek ürün listesinden bir hazırlık seti önerir. product_id'ler JSON şema `enum`'ı
 * ile listeye KISITLI → model olmayan ürün uyduramaz. Dönen id'ler ayrıca doğrulanır.
 */
export async function recommendPreparednessKit(input: {
  need: string
  products: { id: string; title: string; category: string }[]
}): Promise<{ ok: true; data: PreparednessKit } | { ok: false; error: string }> {
  const prods = (input.products ?? []).filter((p) => p?.id && p?.title)
  if (prods.length === 0) return { ok: false, error: "Ürün listesi boş" }
  const ids = prods.map((p) => p.id)

  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            product_id: { type: "string", enum: ids },
            quantity: { type: "integer" },
            reason: { type: "string" },
          },
          required: ["product_id", "quantity", "reason"],
        },
      },
      summary: { type: "string" },
    },
    required: ["items", "summary"],
  } as const

  const system =
    "Sen bir afet/deprem hazırlık uzmanısın. Müşterinin ihtiyacına göre AŞAĞIDAKİ ürün " +
    "listesinden dengeli, gerçekçi bir hazırlık seti öner. SADECE listedeki product_id'leri " +
    "kullan; liste dışı ürün UYDURMA. Kişi sayısı, süre, bebek/yaşlı/evcil hayvan gibi özel " +
    "durumlara göre makul ADET ver (su/gıda kişi ve güne göre artar). Su, gıda, ışık/enerji, " +
    "ilk yardım, ısınma, güvenlik/iletişim gibi temel ihtiyaçları dengeli kapsamaya çalış. " +
    "4-12 kalem yeterli. reason: bu ürün neden sette, kısa Türkçe. summary: setin 1-2 cümlelik " +
    "Türkçe açıklaması. Uygun ürün yoksa items boş bırak."
  const list = prods.map((p) => `${p.id} | ${p.title}${p.category ? ` [${p.category}]` : ""}`).join("\n")
  const userText = `Müşteri ihtiyacı: ${input.need}\n\nÜrünler (id | ad [kategori]):\n${list}`

  const res = await geminiGenerate<PreparednessKit>({
    system,
    userText,
    jsonSchema: schema as unknown as Record<string, unknown>,
    temperature: 0.3,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const d = res.data
  if (!d || !Array.isArray(d.items)) return { ok: false, error: "Geçersiz set yapısı" }
  const seen = new Set<string>()
  const items: KitItem[] = []
  for (const it of d.items) {
    if (!it || typeof it.product_id !== "string" || !ids.includes(it.product_id) || seen.has(it.product_id)) continue
    seen.add(it.product_id)
    items.push({
      product_id: it.product_id,
      quantity: Math.max(1, Math.min(99, Math.round(Number(it.quantity) || 1))),
      reason: String(it.reason ?? ""),
    })
  }
  return { ok: true, data: { items, summary: String(d.summary ?? "") } }
}

// ─────────────────────────── Görev 7: Hazırlık & Güvenlik Asistanı (niyet + rehberlik) ───────────────────────────

export type AssistResult = {
  /** Türkçe konuşma yanıtı: set özeti VEYA güvenlik rehberliği. */
  answer: string
  /** Önerilen ürünler (saf soru/rehberlikte boş olabilir). */
  items: KitItem[]
  /** Yapısal/profesyonel KEŞİF gerekiyor mu (kolon/çatlak/bina güvenliği). */
  recommend_survey: boolean
  /** Keşif neden gerekli — kısa Türkçe (recommend_survey true ise). */
  survey_reason: string
}

/**
 * Deprem Hazırlık & Güvenlik Asistanı. Kullanıcı mesajını sınıflandırır:
 *  - Hazırlık/ürün isteği → listeden DENGELİ set (items) + kısa özet (answer).
 *  - Genel güvenlik sorusu → eyleme dönük rehberlik (answer) + uygunsa ürünler.
 *  - YAPISAL/BİNA güvenliği → ASLA kesin hüküm verme; genel bilgi + "uzman keşfi şart"
 *    (recommend_survey=true). Bu hayati/hukuki sınır prompt'ta zorlanır.
 * product_id'ler JSON şema enum'ı ile gerçek listeye kısıtlı.
 */
export async function assistPreparedness(input: {
  message: string
  products: { id: string; title: string; category: string }[]
}): Promise<{ ok: true; data: AssistResult } | { ok: false; error: string }> {
  const prods = (input.products ?? []).filter((p) => p?.id && p?.title)
  if (prods.length === 0) return { ok: false, error: "Ürün listesi boş" }
  const ids = prods.map((p) => p.id)

  const schema = {
    type: "object",
    properties: {
      answer: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            product_id: { type: "string", enum: ids },
            quantity: { type: "integer" },
            reason: { type: "string" },
          },
          required: ["product_id", "quantity", "reason"],
        },
      },
      recommend_survey: { type: "boolean" },
      survey_reason: { type: "string" },
    },
    required: ["answer", "items", "recommend_survey", "survey_reason"],
  } as const

  const system =
    "Sen depremTek pazaryerinin Türkçe 'Deprem Hazırlık & Güvenlik Asistanı'sın. Kullanıcı ya " +
    "bir hazırlık seti ister ya da bir soru/endişe paylaşır.\n" +
    "- HAZIRLIK/ÜRÜN isteğinde: AŞAĞIDAKİ listeden dengeli bir set öner (items: su, gıda, ışık/enerji, " +
    "ilk yardım, ısınma, güvenlik/iletişim dengeli; kişi/gün/özel duruma göre makul adet). answer'da 1-2 cümle özet.\n" +
    "- GENEL güvenlik/hazırlık sorusunda: answer'da kısa, doğru, eyleme dönük Türkçe rehberlik ver; uygunsa ilgili ürünleri items'a ekle.\n" +
    "- YAPISAL / BİNA GÜVENLİĞİ konuları (kolon, kiriş, çatlak, bina sağlamlığı, hasar, 'oturulur mu', güçlendirme): " +
    "ASLA kesin hüküm VERME — 'güvenli', 'güvenli değil', 'yıkılır', 'oturulmaz' gibi yargılarda BULUNMA. " +
    "Genel bilgilendirme + neyi gözlemleyebileceği + acil tehlikede ne YAPMAMASI gerektiğini söyle; " +
    "kesin değerlendirmenin ancak ruhsatlı bir inşaat mühendisinin YERİNDE keşfiyle yapılabileceğini belirt. " +
    "Bu durumda recommend_survey=true ve survey_reason'da kısa neden yaz (ürün önermek zorunda değilsin).\n" +
    "SADECE listedeki product_id'leri kullan; liste dışı ürün UYDURMA. Tıbbi/hukuki/mühendislik KESİN tavsiyesi verme. " +
    "answer daima Türkçe ve kısa olsun."
  const list = prods.map((p) => `${p.id} | ${p.title}${p.category ? ` [${p.category}]` : ""}`).join("\n")
  const userText = `Kullanıcı mesajı: ${input.message}\n\nÜrünler (id | ad [kategori]):\n${list}`

  const res = await geminiGenerate<AssistResult>({
    system,
    userText,
    jsonSchema: schema as unknown as Record<string, unknown>,
    temperature: 0.3,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const d = res.data
  if (!d || typeof d.answer !== "string") return { ok: false, error: "Geçersiz asistan yanıtı" }
  const seen = new Set<string>()
  const items: KitItem[] = []
  for (const it of Array.isArray(d.items) ? d.items : []) {
    if (!it || typeof it.product_id !== "string" || !ids.includes(it.product_id) || seen.has(it.product_id)) continue
    seen.add(it.product_id)
    items.push({
      product_id: it.product_id,
      quantity: Math.max(1, Math.min(99, Math.round(Number(it.quantity) || 1))),
      reason: String(it.reason ?? ""),
    })
  }
  return {
    ok: true,
    data: {
      answer: String(d.answer ?? ""),
      items,
      recommend_survey: !!d.recommend_survey,
      survey_reason: String(d.survey_reason ?? ""),
    },
  }
}

// ─────────────────────────── Görev 8: Satıcı yanıt taslağı (S-C + mesaj) ───────────────────────────

/**
 * Satıcı adına müşteriye KISA, kibar bir yanıt TASLAĞI üretir (satıcı düzenleyip
 * gönderir). Ürün sorusu veya mesajlaşma için. Düz metin döner. Guardrail: gerçek
 * olmayan özellik/söz uydurmaz; emin olmadığında "kontrol edip döneyim" der.
 */
export async function draftSellerReply(input: {
  kind: "question" | "message"
  productTitle?: string | null
  customerText: string
  history?: { role: "customer" | "seller"; text: string }[]
}): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  if (!input.customerText || !input.customerText.trim()) {
    return { ok: false, error: "Yanıtlanacak içerik yok" }
  }
  const system =
    "Sen bir Türkçe pazaryeri satıcısının müşteri iletişim asistanısın. Satıcı ADINA, müşteriye " +
    "gönderilmek üzere KISA (2-5 cümle), kibar, yardımsever ve net bir yanıt TASLAĞI yaz; satıcı " +
    "bunu düzenleyip gönderecek. Gerçek olmayan teknik özellik, stok, fiyat veya teslimat SÖZÜ " +
    "UYDURMA; emin olmadığın bir bilgide 'kontrol edip en kısa sürede döneceğim' gibi ifade kullan. " +
    "Müşteriden kişisel/iletişim verisi İSTEME. Yalnızca gönderilecek yanıt metnini döndür — " +
    "tırnak, başlık veya ek açıklama EKLEME."

  let userText: string
  if (input.kind === "question") {
    userText =
      `Bu bir ÜRÜN SORUSU.\n` +
      (input.productTitle ? `Ürün: ${input.productTitle}\n` : "") +
      `Müşteri sorusu: """${input.customerText}"""`
  } else {
    const hist = (input.history ?? [])
      .slice(-10)
      .map((m) => `${m.role === "seller" ? "Satıcı" : "Müşteri"}: ${m.text}`)
      .join("\n")
    userText =
      `Bu bir MÜŞTERİ MESAJLAŞMASI.\n` +
      (input.productTitle ? `Konu/ürün: ${input.productTitle}\n` : "") +
      (hist ? `Konuşma geçmişi:\n${hist}\n\n` : "") +
      `Son müşteri mesajı: """${input.customerText}"""`
  }

  const res = await geminiGenerate<string>({ system, userText, temperature: 0.4 })
  if (!res.ok) return { ok: false, error: res.error }
  const draft = (res.data || "").toString().trim()
  if (!draft) return { ok: false, error: "Boş taslak" }
  return { ok: true, draft }
}

// ─────────────────────────── Görev 9: Admin doğal-dil analitiği ───────────────────────────

/**
 * Yöneticinin Türkçe sorusunu, SADECE verilen pazaryeri veri snapshot'ından yanıtlar.
 * Veride olmayan sayı/satıcı uydurmaz (RAG — DB sorgusu çalıştırmaz, enjeksiyon riski yok).
 */
export async function analyzeMarketplaceInsights(input: {
  question: string
  snapshot: unknown
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  if (!input.question || !input.question.trim()) return { ok: false, error: "Soru boş" }
  const system =
    "Sen depremTek pazaryeri yöneticisinin Türkçe veri analistisin. SADECE sana verilen JSON " +
    "verisinden yanıtla; veride OLMAYAN sayı, satıcı veya bilgi UYDURMA. Soruyu kısa ve net " +
    "Türkçe yanıtla; ilgili sayıları belirt (parasal değerler ₺/lira). Karşılaştırma istenirse " +
    "ilgili satıcıları sırala. Veri yetersizse 'bu veriyle yanıtlanamıyor' de — tahmin etme."
  const userText = `Yönetici sorusu: ${input.question}\n\nPazaryeri verisi (JSON):\n${JSON.stringify(input.snapshot)}`
  const res = await geminiGenerate<string>({ system, userText, temperature: 0.2 })
  if (!res.ok) return { ok: false, error: res.error }
  const answer = (res.data || "").toString().trim()
  if (!answer) return { ok: false, error: "Boş yanıt" }
  return { ok: true, answer }
}

// ─────────────────────────── Görev 10: Satıcı karne koçluğu ───────────────────────────

/**
 * Satıcının performans karnesinden (JSON) öncelikli, somut, uygulanabilir Türkçe
 * öneriler üretir (en zayıf metrikleri hedefler). Veride olmayan şey uydurmaz.
 */
export async function coachScorecard(input: {
  scorecard: unknown
}): Promise<{ ok: true; advice: string } | { ok: false; error: string }> {
  const system =
    "Sen bir Türkçe pazaryeri satıcı performans koçusun. Satıcının karne verisinden (JSON) " +
    "ÖNCELİKLİ, somut ve uygulanabilir 2-4 öneri ver (madde işaretleriyle). En zayıf metrikleri " +
    "hedefle: zamanında kargo, müşteri puanı, iade oranı, soru yanıtlama, iptal oranı. Güçlü " +
    "yönleri kısaca takdir et. Veride olmayan bilgi uydurma. Yapıcı, motive edici ve kısa ol."
  const userText = `Satıcı performans karnesi (JSON):\n${JSON.stringify(input.scorecard)}`
  const res = await geminiGenerate<string>({ system, userText, temperature: 0.4 })
  if (!res.ok) return { ok: false, error: res.error }
  const advice = (res.data || "").toString().trim()
  if (!advice) return { ok: false, error: "Boş öneri" }
  return { ok: true, advice }
}

// ─────────────────────────── Blog yazısı üretimi ───────────────────────────

export type GeneratedBlogPost = {
  title: string
  slug: string
  summary: string
  content: string // Markdown (storefront marked.parse ile HTML'e çevirir)
  category: string
}

const BLOG_POST_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    summary: { type: "string" },
    content: { type: "string" },
    category: { type: "string" },
  },
  required: ["title", "slug", "summary", "content", "category"],
} as const

/**
 * Verilen konudan Türkçe, SEO-dostu bir blog yazısı üretir. `content` MARKDOWN'dır
 * (storefront `marked.parse` ile HTML'e çevirir). Afet/deprem hazırlık temalı;
 * uydurma istatistik/iddia EKLEMEZ (fail-safe içerik). Taslak olarak kaydedilip
 * admin tarafından düzenlenip yayınlanması beklenir.
 */
export async function generateBlogPost(input: {
  topic: string
  category?: string | null
  keywords?: string | null
}): Promise<{ ok: true; data: GeneratedBlogPost } | { ok: false; error: string }> {
  const system =
    "Sen afet ve deprem hazırlığı konusunda uzman bir Türkçe içerik editörüsün. Verilen konudan " +
    "özgün, doğru ve SEO-dostu bir blog yazısı üret. KURALLAR: Uydurma istatistik, tarih veya " +
    "bilimsel iddia EKLEME; emin olmadığın sayısal veriyi yazma. Öneriler genel-geçer ve güvenli " +
    "olsun (resmî afet hazırlık tavsiyeleriyle uyumlu). `content` MARKDOWN olmalı: '## ' alt " +
    "başlıklar, kısa paragraflar, '- ' madde listeleri; yaklaşık 500-900 kelime. `title` ilgi çekici " +
    "ama abartısız. `summary` 1-2 cümle. `slug` title'dan türetilmiş kısa, ascii, tireli (ör. " +
    "deprem-cantasi-nasil-hazirlanir). `category` kısa bir kategori adı."
  const userText =
    `Konu: ${input.topic}\n` +
    `Tercih edilen kategori: ${input.category ?? "(serbest)"}\n` +
    `Anahtar kelimeler: ${input.keywords ?? "(yok)"}`
  const res = await geminiGenerate<GeneratedBlogPost>({
    system,
    userText,
    jsonSchema: BLOG_POST_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.7,
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, data: res.data }
}

// ─────────────────────────── Görev 11: Site Asistanı / Maskot "Depremzede" (agent) ───────────────────────────

/** Asistanın önereceği bir ürün (id liste enum'u ile gerçek kataloğa kısıtlı). */
export type AgentProductRef = { product_id: string; quantity: number; reason: string }

/**
 * Site Asistanı yanıtı. Storefront bunu UI eylemlerine çevirir:
 *  - reply: maskotun Türkçe konuşma yanıtı (daima dolu).
 *  - navigate_path: kullanıcıyı GÖTÜRMEK istediği sayfa (izinli slug listesinden) ya da "".
 *  - open_product_id: açılacak TEK ürün detay sayfası (id) ya da "".
 *  - products: sohbette KART olarak gösterilecek ürünler (öneri/set/tek ürün).
 *  - add_all_to_cart: products bir "set" ve sepete eklenmeye hazır mı.
 *  - recommend_survey/survey_reason: YAPISAL güvenlik → uzman keşfi (mevcut guardrail).
 */
export type AgentResult = {
  reply: string
  navigate_path: string
  open_product_id: string
  products: AgentProductRef[]
  add_all_to_cart: boolean
  recommend_survey: boolean
  survey_reason: string
}

export type AgentNavOption = { path: string; label: string }
export type AgentHistoryTurn = { role: "user" | "assistant"; content: string }

/**
 * depremTek maskotu "Depremzede" — siteyi süren konuşkan asistan. Kullanıcı mesajını
 * + kısa geçmişi + bulunduğu sayfayı alır; ya bir sayfaya YÖNLENDİRİR, ya ürün/set
 * ÖNERİR (sepete hazır), ya bir ürünü AÇAR, ya da güvenlik rehberliği verir.
 *
 * Güvenlik sınırları (assistPreparedness ile aynı, hayati): YAPISAL/BİNA güvenliğinde
 * ASLA kesin hüküm vermez → recommend_survey. product_id ve navigate_path JSON şema
 * `enum`'ı ile GERÇEK kataloğa/izinli yollara kısıtlı → model olmayan ürün/sayfa
 * uyduramaz. Dönen değerler ayrıca doğrulanır (fail-closed).
 */
export async function assistAgent(input: {
  message: string
  history?: AgentHistoryTurn[]
  currentPath?: string | null
  products: { id: string; title: string; category: string }[]
  navOptions: AgentNavOption[]
}): Promise<{ ok: true; data: AgentResult } | { ok: false; error: string }> {
  const prods = (input.products ?? []).filter((p) => p?.id && p?.title)
  if (prods.length === 0) return { ok: false, error: "Ürün listesi boş" }
  const ids = prods.map((p) => p.id)
  const navPaths = (input.navOptions ?? []).map((n) => n.path)

  const schema = {
    type: "object",
    properties: {
      reply: { type: "string" },
      // navigate_path/open_product_id boş ("" = yönlendirme/ürün yok) olabildiği için
      // enum KULLANILMAZ: Gemini 3.x, enum içinde boş string'i reddediyor
      // ("enum[0]: cannot be empty" → HTTP 400, asistan komple çöküyordu).
      // İzinli değerler sistem prompt'unda verilir + aşağıda sunucu tarafında
      // doğrulanır (navPaths/ids dışındaki değer "" yapılır), bu yüzden güvenli.
      navigate_path: { type: "string" },
      open_product_id: { type: "string" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            product_id: { type: "string", enum: ids },
            quantity: { type: "integer" },
            reason: { type: "string" },
          },
          required: ["product_id", "quantity", "reason"],
        },
      },
      add_all_to_cart: { type: "boolean" },
      recommend_survey: { type: "boolean" },
      survey_reason: { type: "string" },
    },
    required: [
      "reply",
      "navigate_path",
      "open_product_id",
      "products",
      "add_all_to_cart",
      "recommend_survey",
      "survey_reason",
    ],
  } as const

  const system =
    "Sen depremTek pazaryerinin maskotu ve site asistanı 'Depremzede'sin. Kasketli, sıcak, " +
    "samimi ama bilgili bir karaktersin; deprem hazırlığı ve afet güvenliği konusunda kullanıcıya " +
    "yol gösterir, SİTEYİ onun adına SÜRERSİN. Her zaman Türkçe, kısa ve eyleme dönük konuş; " +
    "1. tekil şahıs ('seni mağazaya götürüyorum', 'şu ürünleri önerdim') kullan.\n" +
    "Elindeki YETENEKLER (uygun olanı seç, birden çok alanı birlikte kullanabilirsin):\n" +
    "- YÖNLENDİRME: Kullanıcı bir sayfaya gitmek/bakmak isterse navigate_path'i AŞAĞIDAKİ izinli " +
    "listeden seç (yalnız oradaki slug'lar geçerli; uydurma). Gerek yoksa \"\" bırak.\n" +
    "- ÜRÜN/SET ÖNERME: Ürün arıyor ya da hazırlık seti istiyorsa products'a AŞAĞIDAKİ listeden " +
    "ürün ekle (su, gıda, ışık/enerji, ilk yardım, ısınma, iletişim dengeli; kişi/gün/özel duruma " +
    "göre makul adet). Bunlar sohbette kart olarak gösterilir. Bir SET öneriyorsan add_all_to_cart=true.\n" +
    "- TEK ÜRÜN AÇMA: Kullanıcı belirli bir ürünün detayını istiyorsa open_product_id'yi o ürüne ayarla.\n" +
    "- SADECE listedeki product_id'leri kullan; liste dışı ürün UYDURMA. Uygun ürün yoksa products boş kalsın.\n" +
    "GÜVENLİK SINIRI (hayati): YAPISAL / BİNA GÜVENLİĞİ (kolon, kiriş, çatlak, bina sağlamlığı, " +
    "hasar, 'oturulur mu', güçlendirme) konularında ASLA kesin hüküm VERME ('güvenli', 'yıkılır', " +
    "'oturulmaz' deme). Genel bilgilendirme + kişinin neyi gözlemleyebileceğini + acil/yakın tehlike " +
    "durumunda ne YAPMAMASI gerektiğini söyle; kesin değerlendirmenin ancak ruhsatlı bir inşaat " +
    "mühendisinin YERİNDE keşfiyle yapılabileceğini belirt; recommend_survey=true ve survey_reason'a " +
    "kısa neden yaz. Tıbbi/hukuki/mühendislik KESİN tavsiyesi verme. reply daima dolu ve Türkçe olsun."

  const navList = (input.navOptions ?? []).map((n) => `${n.path || "(ana sayfa)"} → ${n.label}`).join("\n")
  const prodList = prods.map((p) => `${p.id} | ${p.title}${p.category ? ` [${p.category}]` : ""}`).join("\n")
  // Geçmiş turlar istemciden gelir → içerik enjeksiyonuna karşı: olası sahte rol
  // etiketini ("Kullanıcı:"/"Depremzede:") baştan temizle ve içeriği yeni mesaj gibi
  // üç tırnakla sınırla (tur sınırı taklidini engelle).
  const stripLabel = (s: string) => s.replace(/^\s*(Kullanıcı|Depremzede)\s*:\s*/i, "")
  const hist = (input.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === "assistant" ? "Depremzede" : "Kullanıcı"}: """${stripLabel(String(m.content ?? ""))}"""`)
    .join("\n")

  const userText =
    (hist ? `Önceki konuşma:\n${hist}\n\n` : "") +
    `Kullanıcının bulunduğu sayfa: ${input.currentPath || "(bilinmiyor)"}\n\n` +
    `Kullanıcının yeni mesajı: """${input.message}"""\n\n` +
    `İzinli sayfalar (slug → açıklama):\n${navList}\n\n` +
    `Ürünler (id | ad [kategori]):\n${prodList}`

  const res = await geminiGenerate<AgentResult>({
    system,
    userText,
    jsonSchema: schema as unknown as Record<string, unknown>,
    temperature: 0.4,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const d = res.data
  if (!d || typeof d.reply !== "string" || !d.reply.trim()) {
    return { ok: false, error: "Geçersiz asistan yanıtı" }
  }

  // ─ Doğrulama / normalizasyon (fail-closed) ─
  const navigate_path = navPaths.includes(d.navigate_path) ? d.navigate_path : ""
  const open_product_id = ids.includes(d.open_product_id) ? d.open_product_id : ""
  const seen = new Set<string>()
  const products: AgentProductRef[] = []
  for (const it of Array.isArray(d.products) ? d.products : []) {
    if (!it || typeof it.product_id !== "string" || !ids.includes(it.product_id) || seen.has(it.product_id)) continue
    seen.add(it.product_id)
    products.push({
      product_id: it.product_id,
      quantity: Math.max(1, Math.min(99, Math.round(Number(it.quantity) || 1))),
      reason: String(it.reason ?? ""),
    })
  }

  return {
    ok: true,
    data: {
      reply: d.reply.trim(),
      navigate_path,
      open_product_id,
      products,
      add_all_to_cart: !!d.add_all_to_cart && products.length > 0,
      recommend_survey: !!d.recommend_survey,
      survey_reason: String(d.survey_reason ?? ""),
    },
  }
}
