/**
 * getClientIp — X-Forwarded-For sahteciliğine karşı IP çıkarımı.
 *
 * TRUSTED_PROXY_COUNT modül yüklenirken okunduğu için, farklı vekil sayılarını
 * denemek jest.resetModules() + yeniden require gerektirir.
 */

type Req = { headers: Record<string, unknown>; socket?: { remoteAddress?: string | null } | null }

function load(trustedProxyCount?: string) {
  jest.resetModules()
  if (trustedProxyCount === undefined) delete process.env.TRUSTED_PROXY_COUNT
  else process.env.TRUSTED_PROXY_COUNT = trustedProxyCount
  // Modül env okumasını yükleme anında yapıyor; env'i kurduktan SONRA taze
  // yüklemek için dinamik require şart (import hoisting buna izin vermez).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../client-ip").getClientIp as (req: Req) => string
}

const req = (xff?: string | string[], socketIp = "10.0.0.1"): Req => ({
  headers: xff === undefined ? {} : { "x-forwarded-for": xff },
  socket: { remoteAddress: socketIp },
})

afterAll(() => {
  delete process.env.TRUSTED_PROXY_COUNT
})

describe("getClientIp — tek nginx arkasında (varsayılan)", () => {
  it("SAHTECİLİK: istemcinin uydurduğu soldaki değeri KULLANMAZ", () => {
    const getClientIp = load()
    // nginx gelen "1.2.3.4" uydurmasının sonuna gerçek IP'yi ekler.
    expect(getClientIp(req("1.2.3.4, 203.0.113.9"))).toEqual("203.0.113.9")
  })

  it("uydurma zinciri ne kadar uzun olursa olsun son (nginx'in yazdığı) değer alınır", () => {
    const getClientIp = load()
    expect(getClientIp(req("9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.9"))).toEqual("203.0.113.9")
  })

  it("başlık yoksa TCP eşine düşer", () => {
    const getClientIp = load()
    expect(getClientIp(req(undefined, "198.51.100.5"))).toEqual("198.51.100.5")
  })

  it("tek girdi varsa (uydurma yok) onu döner", () => {
    const getClientIp = load()
    expect(getClientIp(req("203.0.113.9"))).toEqual("203.0.113.9")
  })

  it("başlık dizi olarak gelirse de zincir olarak çözülür", () => {
    const getClientIp = load()
    expect(getClientIp(req(["1.2.3.4", "203.0.113.9"]))).toEqual("203.0.113.9")
  })
})

describe("getClientIp — vekil sayısı ayarı", () => {
  it("TRUSTED_PROXY_COUNT=0 → XFF tamamen yok sayılır, yalnız TCP eşi", () => {
    const getClientIp = load("0")
    expect(getClientIp(req("1.2.3.4, 203.0.113.9", "198.51.100.5"))).toEqual("198.51.100.5")
  })

  it("TRUSTED_PROXY_COUNT=2 (CDN + nginx) → sağdan ikinci değer", () => {
    const getClientIp = load("2")
    // uydurma, gerçek istemci, CDN edge
    expect(getClientIp(req("1.2.3.4, 203.0.113.9, 172.16.0.1"))).toEqual("203.0.113.9")
  })

  it("zincir beklenenden kısaysa uydurmaya düşmez, TCP eşini kullanır", () => {
    const getClientIp = load("3")
    expect(getClientIp(req("1.2.3.4", "198.51.100.5"))).toEqual("198.51.100.5")
  })

  it("geçersiz ayar (çöp değer) varsayılana (1) döner", () => {
    const getClientIp = load("abc")
    expect(getClientIp(req("1.2.3.4, 203.0.113.9"))).toEqual("203.0.113.9")
  })
})

describe("getClientIp — normalleştirme", () => {
  it("IPv6-mapped IPv4 sadeleşir", () => {
    const getClientIp = load()
    expect(getClientIp(req(undefined, "::ffff:203.0.113.9"))).toEqual("203.0.113.9")
  })

  it("IPv4'e iliştirilmiş port atılır", () => {
    const getClientIp = load()
    expect(getClientIp(req("203.0.113.9:51234"))).toEqual("203.0.113.9")
  })

  it("IPv6 adresi bozulmadan geçer (port ayrıştırması IPv6'yı kesmemeli)", () => {
    const getClientIp = load()
    expect(getClientIp(req("2001:db8::1"))).toEqual("2001:db8::1")
  })

  it("boşluklu zincir düzgün ayrıştırılır", () => {
    const getClientIp = load()
    expect(getClientIp(req("  1.2.3.4 ,   203.0.113.9  "))).toEqual("203.0.113.9")
  })

  it("hiçbir şey belirlenemezse unknown_ip", () => {
    const getClientIp = load()
    expect(getClientIp({ headers: {}, socket: null })).toEqual("unknown_ip")
  })
})
