import {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { Redis } from "ioredis"
import { getClientIp } from "./client-ip"

/**
 * Rate limiter — Redis destekli, çok-sunuculu (yatay ölçek) ortamda tutarlı.
 *
 * REDIS_URL tanımlıysa sayaçlar Redis'te tutulur (tüm backend instance'ları aynı
 * sayacı paylaşır → gerçek IP-bazlı limit). REDIS_URL yoksa (ör. bazı yerel/test
 * ortamları) süreç-içi in-memory Map'e düşer; davranış aynıdır ama tek sürece özeldir.
 *
 * Tasarım kararı: Redis bir hata verirse FAIL-OPEN (limitlenmemiş say) — geçici bir
 * Redis kesintisi tüm trafiği bloklamasın. Eski in-memory limiter da restart'ta sıfırlandığı
 * için bu davranış mevcut güven modeliyle tutarlı.
 */

let redisClient: Redis | null | undefined
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient
  const url = process.env.REDIS_URL
  if (!url) {
    redisClient = null
    return null
  }
  try {
    redisClient = new Redis(url, {
      // Rate-limit yolunda hızlı başarısızlık; istek başına sonsuz retry yapma.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    })
    redisClient.on("error", () => {
      // Sessiz: her komutta isLimited zaten try/catch ile fail-open yapıyor.
    })
  } catch {
    redisClient = null
  }
  return redisClient
}

// Atomik "sayacı artır, ilk artışta pencere TTL'i ata" (INCR+PEXPIRE arası race olmasın).
const INCR_WITH_EXPIRE = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`

/**
 * Middleware biçimindeki limit testte devre dışı: NODE_ENV=test (CI workflow'u
 * bunu veriyor) ya da DISABLE_RATE_LIMIT=true. Yalnız rateLimitMiddleware'i
 * etkiler; route içinden çağrılan enforceRateLimit'e dokunmaz.
 */
const RATE_LIMIT_BYPASSED =
  process.env.NODE_ENV === "test" || process.env.DISABLE_RATE_LIMIT === "true"

interface RateLimitRecord {
  count: number
  resetTime: number
}

export class RateLimiter {
  // Redis kapalıyken kullanılan süreç-içi fallback.
  private cache = new Map<string, RateLimitRecord>()

  constructor(
    private limit: number,
    private windowMs: number,
    private name: string // Redis anahtar öneki (limiter'lar arası izolasyon)
  ) {
    setInterval(() => {
      const now = Date.now()
      for (const [key, value] of this.cache.entries()) {
        if (now > value.resetTime) this.cache.delete(key)
      }
    }, 60000).unref()
  }

  private key(ip: string): string {
    return `rl:${this.name}:${ip}`
  }

  /** Limit aşıldıysa true. Redis varsa paylaşımlı sayaç, yoksa in-memory. */
  public async isLimited(ip: string): Promise<boolean> {
    const client = getRedis()
    if (client) {
      try {
        const count = (await client.eval(
          INCR_WITH_EXPIRE,
          1,
          this.key(ip),
          String(this.windowMs)
        )) as number
        return count > this.limit
      } catch {
        return false // fail-open
      }
    }
    // In-memory fallback (mevcut davranış).
    const now = Date.now()
    const record = this.cache.get(ip)
    if (!record || now > record.resetTime) {
      this.cache.set(ip, { count: 1, resetTime: now + this.windowMs })
      return false
    }
    record.count += 1
    return record.count > this.limit
  }

  public async getRemainingSeconds(ip: string): Promise<number> {
    const client = getRedis()
    if (client) {
      try {
        const ttlMs = (await client.pttl(this.key(ip))) as number
        return ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0
      } catch {
        return 0
      }
    }
    const record = this.cache.get(ip)
    if (!record) return 0
    return Math.max(0, Math.ceil((record.resetTime - Date.now()) / 1000))
  }
}

// Geriye dönük uyumluluk: eski isim kullanan import'lar kırılmasın.
export const InMemoryRateLimiter = RateLimiter

// --- Limiter örnekleri (3. arg = Redis anahtar öneki) ---------------------
// PayTR Callback (sunucu-sunucu bildirim): dakikada 20
export const callbackLimiter = new RateLimiter(20, 60000, "callback")
// Order tracking: dakikada 10 (sıralı sipariş no + tahmini email enumerasyonuna karşı)
export const orderTrackingLimiter = new RateLimiter(10, 60000, "order-tracking")
// PayTR iframe token imzalama: dakikada 30
export const hashLimiter = new RateLimiter(30, 60000, "hash")
// Yorum gönderimi: dakikada 5 (spam yorumlara karşı)
export const reviewLimiter = new RateLimiter(5, 60000, "review")
// Bayilik başvurusu: saatte 3 (spam başvurulara karşı)
export const resellerLimiter = new RateLimiter(3, 3600000, "reseller")
// Uzman ön-kayıt / ilgi formu: saatte 3 (spam başvurulara karşı)
export const expertLeadLimiter = new RateLimiter(3, 3600000, "expert-lead")
// Uzman belge yükleme: 5 dakikada 12 (kayıt sırasında birkaç belge yüklenebilir)
export const expertUploadLimiter = new RateLimiter(12, 300000, "expert-upload")
// Uzmana hizmet talebi bırakma: 10 dakikada 5 (spam talebe karşı)
export const expertRequestLimiter = new RateLimiter(5, 600000, "expert-request")
// İade talebi: dakikada 5 (spam iade taleplerine karşı)
export const returnRequestLimiter = new RateLimiter(5, 60000, "return-request")

export const newsletterLimiter = new RateLimiter(5, 600000, "newsletter")
// Google hesap bağlama: dakikada 5
export const googleLinkLimiter = new RateLimiter(5, 60000, "google-link")
// Satıcı (vendor) ağır/yan-etkili uçları: toplu ürün yükleme (500 satır + workflow)
// ve mesajlaşma (mail tetikler). Kimlik doğrulamalı ama suistimale karşı IP limiti.
export const vendorBulkLimiter = new RateLimiter(5, 60000, "vendor-bulk")
export const vendorMessageLimiter = new RateLimiter(30, 60000, "vendor-message")

// Davranış olayı alımı — yüksek frekanslı (sayfa gezme), bu yüzden lenient: IP
// başına 120/dk. Yalnız kötüye-kullanım selini keser, normal gezinmeyi etkilemez.
export const trackLimiter = new RateLimiter(120, 60000, "track")

// Maskot AI asistanı — her istek ücretli LLM çağrısı + 300-satır ürün sorgusu yapar;
// kimliksiz/açık uç olduğundan IP başına 20/dk ile maliyet/DoS amplifikasyonu sınırlanır.
export const assistantLimiter = new RateLimiter(20, 60000, "assistant")

// --- Kimlik doğrulama (/auth/*) ------------------------------------------
// Giriş, kayıt ve parola sıfırlama uçları Medusa çekirdeğinden gelir ve daha
// önce HİÇBİR uygulama seviyesi limiti yoktu → brute-force ve credential
// stuffing'e açıktı. İki katman:
//   - Patlama: IP başına dakikada 10 deneme (otomatik araçları anında keser).
//   - Toplam:  IP başına saatte 60 deneme (yavaş, sabırlı denemeleri de keser;
//              tek katman dakikalık limit günde ~14 bin denemeye izin verirdi).
// Gerçek kullanıcı bir girişte 1-3 istek yapar; bu değerler paylaşımlı ofis/NAT
// IP'lerinde bile rahat bir pay bırakır.
// Sınırlar env ile ayarlanabilir (üretimde trafiğe göre gevşetilip sıkılabilsin).
const envInt = (name: string, fallback: number): number => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : fallback
}
export const authBurstLimiter = new RateLimiter(
  envInt("AUTH_RATE_LIMIT_PER_MIN", 10),
  60_000,
  "auth-burst"
)
export const authHourlyLimiter = new RateLimiter(
  envInt("AUTH_RATE_LIMIT_PER_HOUR", 60),
  3_600_000,
  "auth-hour"
)

/**
 * Ortak yardımcı: istek IP'si için rate-limit uygula. Limitlenmişse 429 yazıp true döner;
 * çağıran route hemen `return` etmeli. ASYNC — `await enforceRateLimit(...)` olarak kullan.
 */
export async function enforceRateLimit(
  limiter: RateLimiter,
  req: MedusaRequest,
  res: MedusaResponse
): Promise<boolean> {
  // X-Forwarded-For'un SOLDAN ilk değeri istemci uydurmasıdır — ona göre
  // anahtarlamak, başlığı her istekte değiştiren saldırgana limiti tamamen
  // baypas ettirir. getClientIp sağdan/güvenilir vekil sayısına göre çözer.
  const clientIp = getClientIp(req)
  if (await limiter.isLimited(clientIp)) {
    res.status(429).json({
      success: false,
      message: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
      retryAfterSeconds: await limiter.getRemainingSeconds(clientIp),
    })
    return true
  }
  return false
}

/**
 * MIDDLEWARE biçimi — Medusa'nın KENDİ route'larına limit uygulamak için.
 *
 * `/auth/*` (giriş, kayıt, parola sıfırlama) çekirdek route'lar olduğu için
 * dosyalarına `enforceRateLimit` çağrısı ekleyemiyoruz; bu sarmalayıcı
 * middlewares.ts'ten takılır. Birden fazla limiter verilebilir (ör. kısa
 * pencerede patlama + uzun pencerede toplam deneme) — HERHANGİ biri aşılırsa
 * 429 döner.
 *
 * Redis yoksa limiter süreç-içi fallback'e düşer; çok örnekli dağıtımda
 * koruma örnek başına olur, o yüzden üretimde REDIS_URL önerilir.
 */
export function rateLimitMiddleware(...limiters: RateLimiter[]) {
  return async (
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ): Promise<void> => {
    // Entegrasyon (E2E) testleri tek IP'den onlarca hesap açıp giriş yapıyor;
    // gerçek limitler orada 429 üretip test paketini düşürür (nitekim bu middleware
    // eklendiğinde CI kırıldı ve deploy bloke oldu). Limiter'ın KENDİ davranışı
    // rate-limiter.unit.spec.ts ile ayrıca test ediliyor, dolayısıyla burada
    // devre dışı bırakmak kapsam kaybı yaratmıyor.
    if (RATE_LIMIT_BYPASSED) {
      next()
      return
    }
    const clientIp = getClientIp(req)
    for (const limiter of limiters) {
      if (await limiter.isLimited(clientIp)) {
        const retryAfterSeconds = await limiter.getRemainingSeconds(clientIp)
        res.setHeader("Retry-After", String(Math.max(1, retryAfterSeconds)))
        res.status(429).json({
          success: false,
          message:
            "Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.",
          retryAfterSeconds,
        })
        return
      }
    }
    next()
  }
}
