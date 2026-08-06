import {
  getStockAlertTtlDays,
  isStockAlertExpired,
  resolveAlertTargets,
  type SubscriptionLike,
} from "../stock-alert-policy"

const sub = (endpoint: string, customer_id: string | null = null): SubscriptionLike => ({
  endpoint,
  customer_id,
})

function index(subs: SubscriptionLike[]) {
  const subByEndpoint = new Map(subs.map((s) => [s.endpoint, s]))
  const subsByCustomer = new Map<string, SubscriptionLike[]>()
  for (const s of subs) {
    if (!s.customer_id) continue
    subsByCustomer.set(s.customer_id, [
      ...(subsByCustomer.get(s.customer_id) ?? []),
      s,
    ])
  }
  return { subByEndpoint, subsByCustomer }
}

describe("resolveAlertTargets", () => {
  it("hesaba bağlı uyarıyı müşterinin TÜM cihazlarına yollar", () => {
    // Telefonda kurulan uyarı masaüstünde de görülmeli (kayıt cihaza değil hesaba ait).
    const subs = [sub("telefon", "cus_1"), sub("masaustu", "cus_1")]
    const targets = resolveAlertTargets(
      { endpoint: "telefon", customer_id: "cus_1" },
      index(subs)
    )
    expect(targets.map((s) => s.endpoint).sort()).toEqual(["masaustu", "telefon"])
  })

  it("başka müşterinin cihazına sızmaz", () => {
    const subs = [sub("telefon", "cus_1"), sub("baskasi", "cus_2")]
    const targets = resolveAlertTargets(
      { endpoint: "telefon", customer_id: "cus_1" },
      index(subs)
    )
    expect(targets.map((s) => s.endpoint)).toEqual(["telefon"])
  })

  it("hesabın cihazı kalmadıysa kendi endpoint'ine düşer", () => {
    const subs = [sub("telefon", "cus_1")]
    const targets = resolveAlertTargets(
      // Uyarı cus_1'e ait; abonelik de cus_1'e bağlı → kendi cihazı hedef.
      { endpoint: "telefon", customer_id: "cus_1" },
      index(subs)
    )
    expect(targets).toHaveLength(1)
  })

  it("BAĞI ÇÖZÜLMÜŞ cihaza (customer_id null) eski sahibin bildirimi GİTMEZ", () => {
    // Çıkışta bağ bilerek çözülüyor; ortak cihazda yeni kullanıcı eski sahibin
    // bildirimini görmemeli. `customer_id === null` "artık onun değil" demektir.
    const subs = [sub("ortak-cihaz", null)]
    const targets = resolveAlertTargets(
      { endpoint: "ortak-cihaz", customer_id: "cus_1" },
      index(subs)
    )
    expect(targets).toEqual([])
  })

  it("cihaz başka hesaba geçtiyse gönderilmez", () => {
    const subs = [sub("ortak-cihaz", "cus_2")]
    const targets = resolveAlertTargets(
      { endpoint: "ortak-cihaz", customer_id: "cus_1" },
      index(subs)
    )
    expect(targets).toEqual([])
  })

  it("hesapsız (misafir dönemi) uyarı yalnız kendi endpoint'ine gider", () => {
    const subs = [sub("misafir-cihaz", null), sub("baska", "cus_9")]
    const targets = resolveAlertTargets(
      { endpoint: "misafir-cihaz", customer_id: null },
      index(subs)
    )
    expect(targets.map((s) => s.endpoint)).toEqual(["misafir-cihaz"])
  })

  it("abonelik hiç yoksa boş döner (kayıt teslim edilemez sayılır)", () => {
    expect(
      resolveAlertTargets({ endpoint: "yok", customer_id: null }, index([]))
    ).toEqual([])
  })
})

describe("getStockAlertTtlDays", () => {
  it("varsayılan 90 gündür", () => {
    expect(getStockAlertTtlDays({})).toBe(90)
  })

  it("ortam değişkeniyle geçersiz kılınır", () => {
    expect(getStockAlertTtlDays({ STOCK_ALERT_TTL_DAYS: "30" })).toBe(30)
  })

  it("geçersiz/negatif değerde varsayılana döner", () => {
    expect(getStockAlertTtlDays({ STOCK_ALERT_TTL_DAYS: "abc" })).toBe(90)
    expect(getStockAlertTtlDays({ STOCK_ALERT_TTL_DAYS: "0" })).toBe(90)
    expect(getStockAlertTtlDays({ STOCK_ALERT_TTL_DAYS: "-5" })).toBe(90)
  })
})

describe("isStockAlertExpired", () => {
  const now = Date.UTC(2026, 7, 6)
  const gunOnce = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000)

  it("TTL'i aşan kaydı düşürür", () => {
    expect(isStockAlertExpired(gunOnce(91), now, 90)).toBe(true)
  })

  it("TTL içindeki kaydı korur", () => {
    expect(isStockAlertExpired(gunOnce(89), now, 90)).toBe(false)
    expect(isStockAlertExpired(gunOnce(0), now, 90)).toBe(false)
  })

  it("ISO string tarihi de kabul eder", () => {
    expect(isStockAlertExpired(gunOnce(120).toISOString(), now, 90)).toBe(true)
  })

  it("tarih okunamıyorsa SİLMEZ (sessiz veri kaybı yerine fazladan saklama)", () => {
    expect(isStockAlertExpired(null, now, 90)).toBe(false)
    expect(isStockAlertExpired(undefined, now, 90)).toBe(false)
    expect(isStockAlertExpired("bozuk-tarih", now, 90)).toBe(false)
    expect(isStockAlertExpired(new Date(0), now, 90)).toBe(false)
  })
})
