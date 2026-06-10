import { RateLimiter } from "../rate-limiter"

/**
 * Rate limiter'ın in-memory fallback mantığı (REDIS_URL yokken). Redis yolu canlı
 * ortamda doğrulandı (429 + rl:* anahtarı); burada limit sayacının doğruluğunu kilitleriz.
 */
describe("rate-limiter (in-memory fallback)", () => {
  beforeAll(() => {
    // getRedis() ilk isLimited çağrısında env'i okur; Redis'siz in-memory yola zorla.
    delete process.env.REDIS_URL
  })

  it("limit aşılana kadar false, aşınca true döner", async () => {
    const rl = new RateLimiter(3, 60000, "test-limit")
    expect(await rl.isLimited("ip-1")).toBe(false) // 1
    expect(await rl.isLimited("ip-1")).toBe(false) // 2
    expect(await rl.isLimited("ip-1")).toBe(false) // 3
    expect(await rl.isLimited("ip-1")).toBe(true) // 4 > 3 → limitli
    expect(await rl.isLimited("ip-1")).toBe(true) // limitli kalır
  })

  it("farklı IP'ler bağımsız sayılır", async () => {
    const rl = new RateLimiter(1, 60000, "test-isolation")
    expect(await rl.isLimited("a")).toBe(false)
    expect(await rl.isLimited("a")).toBe(true) // a limitli
    expect(await rl.isLimited("b")).toBe(false) // b taze
  })

  it("getRemainingSeconds pencere süresi içinde pozitif döner", async () => {
    const rl = new RateLimiter(1, 60000, "test-ttl")
    await rl.isLimited("x")
    const remaining = await rl.getRemainingSeconds("x")
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(60)
  })
})
