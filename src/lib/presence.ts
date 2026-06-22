import Redis from "ioredis"

/**
 * Eşzamanlı çalışma farkındalığı (presence) — "şu an kim hangi kaydı görüntülüyor".
 * Panel ~15 sn'de bir "buradayım" sinyali (heartbeat) gönderir; aynı kaydı açan
 * diğer kullanıcılar döner. Yumuşak uyarı içindir (kaydetmeyi engellemez).
 *
 * İki arka uç:
 *  - REDIS_URL tanımlıysa Redis (çok-instance prod için doğru).
 *  - Tanımlı değilse bellek-içi (tek-instance dev + test); süreç içi yeterli.
 * Anahtar: presence:{sellerId}:{resource} → field=adminId, value={name,editing,ts}.
 * Okurken TTL'i geçmiş (bayat) üyeler elenir.
 */

const TTL_SECONDS = 30
const TTL_MS = TTL_SECONDS * 1000

export type PresenceMember = {
  id: string
  name: string | null
  editing: boolean
  /** Son sinyalden bu yana geçen saniye (yaklaşık). */
  since_seconds: number
}

type Entry = { name: string | null; editing: boolean; ts: number }

function keyFor(sellerId: string, resource: string): string {
  return `presence:${sellerId}:${resource}`
}

// ── Redis arka ucu (REDIS_URL varsa) ────────────────────────────────────────
let redisClient: Redis | null = null
function redis(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 })
    redisClient.on("error", () => {
      /* presence kritik değil; bağlantı hatasını yut */
    })
  }
  return redisClient
}

// ── Bellek-içi arka uç (REDIS_URL yoksa) ────────────────────────────────────
const mem = new Map<string, Map<string, Entry>>()

function pickOthers(
  entries: Array<[string, Entry]>,
  selfId: string,
  nowMs: number
): PresenceMember[] {
  const others: PresenceMember[] = []
  for (const [id, e] of entries) {
    if (id === selfId) continue
    const ageMs = nowMs - e.ts
    if (ageMs < TTL_MS) {
      others.push({
        id,
        name: e.name ?? null,
        editing: !!e.editing,
        since_seconds: Math.max(0, Math.floor(ageMs / 1000)),
      })
    }
  }
  return others
}

/**
 * "Buradayım" sinyali kaydeder ve AYNI kayıttaki DİĞER aktif kullanıcıları döndürür.
 * nowMs çağırandan verilir (route'ta Date.now()).
 */
export async function heartbeat(
  sellerId: string,
  resource: string,
  admin: { id: string; name: string | null },
  editing: boolean,
  nowMs: number
): Promise<PresenceMember[]> {
  const key = keyFor(sellerId, resource)
  const entry: Entry = { name: admin.name, editing, ts: nowMs }

  const r = redis()
  if (r) {
    try {
      await r.hset(key, admin.id, JSON.stringify(entry))
      await r.expire(key, TTL_SECONDS)
      const all = await r.hgetall(key)
      const parsed: Array<[string, Entry]> = []
      for (const [id, val] of Object.entries(all)) {
        try {
          parsed.push([id, JSON.parse(val) as Entry])
        } catch {
          /* bozuk kayıt → atla */
        }
      }
      return pickOthers(parsed, admin.id, nowMs)
    } catch {
      return [] // Redis erişilemezse presence sessizce devre dışı
    }
  }

  // Bellek-içi
  let inner = mem.get(key)
  if (!inner) {
    inner = new Map()
    mem.set(key, inner)
  }
  inner.set(admin.id, entry)
  // Bayatları temizle (bellek sızmasın)
  for (const [id, e] of inner) {
    if (nowMs - e.ts >= TTL_MS) inner.delete(id)
  }
  return pickOthers([...inner.entries()], admin.id, nowMs)
}

/** Bir kullanıcıyı kayıttan düşürür (ekrandan ayrılınca). */
export async function leave(
  sellerId: string,
  resource: string,
  adminId: string
): Promise<void> {
  const key = keyFor(sellerId, resource)
  const r = redis()
  if (r) {
    try {
      await r.hdel(key, adminId)
    } catch {
      /* yut */
    }
    return
  }
  mem.get(key)?.delete(adminId)
}
