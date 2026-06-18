/**
 * Düşük seviyeli Gemini istemcisi — TEK sağlayıcı-bağımlı dosya.
 * Geri kalan kod yalnızca buradaki tiplenmiş yardımcıları kullanır; sağlayıcı
 * değişirse (Gemini → başka) sadece bu dosya değişir.
 *
 * REST `generateContent` uç noktasını saf `fetch` ile çağırır (yeni bağımlılık yok).
 * Anahtar `GEMINI_API_KEY`, model `GEMINI_MODEL` env'inden okunur — koda yazılmaz.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

export type LlmImage = {
  /** base64 (data URI değil, saf base64). */
  data: string
  /** ör. "image/jpeg", "image/png", "image/webp". */
  mimeType: string
}

export type GenerateOptions = {
  /** Sistem talimatı (rol/davranış). */
  system?: string
  /** Kullanıcı metni (değerlendirilecek içerik). */
  userText: string
  /** Görseller (vision görevleri için). */
  images?: LlmImage[]
  /** Verilirse model SADECE bu şemaya uyan JSON döndürür. */
  jsonSchema?: Record<string, unknown>
  /** 0 = deterministik (moderasyon için önerilir). */
  temperature?: number
  /** Zaman aşımı (ms). */
  timeoutMs?: number
}

export type GenerateResult<T = string> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: string }

/**
 * Bir görsel URL'sini indirip base64'e çevirir (vision moderasyonu için).
 * Başarısız olursa null döner (çağıran atlayabilir). Çok büyük görseller atlanır.
 */
export async function fetchImageAsBase64(
  url: string,
  maxBytes = 8 * 1024 * 1024,
  timeoutMs = 15000
): Promise<LlmImage | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const mimeType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim()
    if (!mimeType.startsWith("image/")) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > maxBytes) return null
    return { data: buf.toString("base64"), mimeType }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function getConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const model = (process.env.GEMINI_MODEL || "gemini-3.1-flash-lite").trim()
  if (!apiKey) return null
  return { apiKey, model }
}

/** AI moderasyonu açık mı? (env ile kapatılabilir → fail-open için kontrol). */
export function isLlmEnabled(): boolean {
  return process.env.AI_MODERATION_ENABLED !== "false" && !!process.env.GEMINI_API_KEY?.trim()
}

/**
 * Gemini'ye tek bir generateContent isteği. jsonSchema verilirse dönen değer
 * parse edilmiş nesne; yoksa düz metin.
 */
export async function geminiGenerate<T = string>(
  opts: GenerateOptions
): Promise<GenerateResult<T>> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: "GEMINI_API_KEY tanımlı değil" }

  const parts: Record<string, unknown>[] = [{ text: opts.userText }]
  for (const img of opts.images ?? []) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } })
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0,
      ...(opts.jsonSchema
        ? { responseMimeType: "application/json", responseSchema: opts.jsonSchema }
        : {}),
    },
  }
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000)
  try {
    const res = await fetch(
      `${API_BASE}/${encodeURIComponent(cfg.model)}:generateContent?key=${cfg.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    )
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      return { ok: false, error: `Gemini HTTP ${res.status}: ${errText.slice(0, 300)}` }
    }
    const json = (await res.json()) as any
    // Güvenlik bloğu / boş yanıt kontrolü
    const cand = json?.candidates?.[0]
    const text: string | undefined = cand?.content?.parts
      ?.map((p: any) => p?.text)
      .filter(Boolean)
      .join("")
    if (!text) {
      const blocked = cand?.finishReason || json?.promptFeedback?.blockReason
      return { ok: false, error: `Boş Gemini yanıtı${blocked ? ` (finishReason: ${blocked})` : ""}` }
    }
    if (!opts.jsonSchema) {
      return { ok: true, data: text as unknown as T, raw: text }
    }
    try {
      return { ok: true, data: JSON.parse(text) as T, raw: text }
    } catch {
      return { ok: false, error: `JSON parse hatası: ${text.slice(0, 200)}` }
    }
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Gemini zaman aşımı" : e?.message || "Gemini isteği başarısız"
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}
