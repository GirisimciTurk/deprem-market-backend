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
