/**
 * Yakalanan bir değerden GÜVENLE okunabilir mesaj çıkarır.
 *
 * NEDEN VAR: Kod tabanında 83 yerde `catch (e: any)` + `e?.message` kalıbı vardı.
 * JavaScript'te `throw` edilen şeyin Error olma zorunluluğu yok — string, düz
 * nesne, hatta `null` atılabilir; kütüphaneler ve HTTP istemcileri sıkça
 * Error olmayan değerler fırlatır. O durumda `e?.message` sessizce `undefined`
 * döner ve log satırları / kullanıcıya giden hata mesajları düz metin
 * "undefined" olur — yani hata TAM da tanı koymak istediğin anda bilgi kaybeder.
 *
 * Bu yardımcı sırayla dener: Error.message → string'in kendisi → nesnedeki
 * `message` alanı → JSON gösterimi → verilen yedek metin. Hiçbir zaman
 * `undefined` döndürmez ve ASLA throw etmez.
 */
export function errorMessage(e: unknown, fallback = "Bilinmeyen hata"): string {
  if (e instanceof Error) {
    return e.message || fallback
  }
  if (typeof e === "string") {
    return e.trim() || fallback
  }
  if (e && typeof e === "object") {
    const msg = (e as { message?: unknown }).message
    if (typeof msg === "string" && msg.trim()) {
      return msg
    }
    try {
      const json = JSON.stringify(e)
      // "{}" bilgi taşımaz; yedek metin daha yararlı.
      if (json && json !== "{}") return json
    } catch {
      /* döngüsel referans — yedeğe düş */
    }
  }
  return fallback
}
