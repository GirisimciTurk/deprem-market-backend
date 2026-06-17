import {
  applyServicePayment,
  computeServicePayout,
  decodeServiceOid,
  derivePaymentStatus,
  encodeServiceOid,
  isPhasePaid,
  isServiceOid,
  isWorkDelivered,
  phaseAmount,
  refreshServicePayout,
} from "../service-payment"

/**
 * Hizmet ödemesi/escrow yardımcılarını KİLİTLER: merchant_oid round-trip,
 * komisyon matematiği, ödeme durumu makinesi ve payout hakediş kuralları.
 */

// Gerçek service_request id formatı: prefix'siz 26-karakter ULID.
const ID = "01KVAPHDSXPH9X5EY132GVPHEY"

describe("merchant_oid kodlama", () => {
  it("survey/deposit/balance round-trip eder", () => {
    for (const phase of ["survey", "deposit", "balance"] as const) {
      const oid = encodeServiceOid(ID, phase)
      expect(isServiceOid(oid)).toBe(true)
      expect(decodeServiceOid(oid)).toEqual({ id: ID, phase })
    }
  })

  it("attempt eki round-trip'i bozmaz (benzersizlik için)", () => {
    const oid = encodeServiceOid(ID, "deposit", 3)
    expect(oid).toBe(`srq${ID}d3`)
    expect(decodeServiceOid(oid)).toEqual({ id: ID, phase: "deposit" })
  })

  it("oid alfanümeriktir (PayTR şartı)", () => {
    expect(encodeServiceOid(ID, "balance", 2)).toMatch(/^[a-zA-Z0-9]+$/)
  })

  it("hizmet-dışı / bozuk oid'leri reddeder", () => {
    expect(isServiceOid("payses_01ABC")).toBe(false)
    expect(decodeServiceOid("payses_01ABC")).toBeNull()
    expect(decodeServiceOid("srqTOOSHORT")).toBeNull()
    expect(decodeServiceOid(`srq${ID}x`)).toBeNull() // geçersiz faz karakteri
  })
})

describe("faz tutarı / ödenmişlik", () => {
  const req = {
    survey_fee: 500,
    deposit_amount: 2000,
    balance_amount: 3000,
    payments: [{ phase: "survey", amount: 500, status: "paid" }],
  }
  it("phaseAmount doğru alanı okur", () => {
    expect(phaseAmount(req, "survey")).toBe(500)
    expect(phaseAmount(req, "deposit")).toBe(2000)
    expect(phaseAmount({}, "balance")).toBe(0)
  })
  it("isPhasePaid yalnız 'paid' kalemi sayar", () => {
    expect(isPhasePaid(req, "survey")).toBe(true)
    expect(isPhasePaid(req, "deposit")).toBe(false)
    expect(isPhasePaid({ payments: [{ phase: "deposit", status: "pending" }] }, "deposit")).toBe(false)
  })
})

describe("derivePaymentStatus (monotonik)", () => {
  const paid = (...phases: string[]) => ({
    payments: phases.map((p) => ({ phase: p, status: "paid" })),
  })
  it("hiç ödeme yoksa none", () => {
    expect(derivePaymentStatus({ payments: [] })).toBe("none")
  })
  it("sadece keşif → survey_paid", () => {
    expect(derivePaymentStatus(paid("survey"))).toBe("survey_paid")
  })
  it("kapora → deposit_paid", () => {
    expect(derivePaymentStatus(paid("survey", "deposit"))).toBe("deposit_paid")
  })
  it("bakiye → paid", () => {
    expect(derivePaymentStatus(paid("deposit", "balance"))).toBe("paid")
  })
})

describe("computeServicePayout (komisyon)", () => {
  it("%10 komisyon", () => {
    expect(computeServicePayout({ commission_rate: 10, paid_total: 5000 })).toEqual({
      commission_amount: 500,
      payout_amount: 4500,
    })
  })
  it("is_house (komisyon 0) → tamamı bayiye", () => {
    expect(computeServicePayout({ commission_rate: 0, paid_total: 5000 })).toEqual({
      commission_amount: 0,
      payout_amount: 5000,
    })
  })
  it("yuvarlama (TL major tam sayı)", () => {
    expect(computeServicePayout({ commission_rate: 15, paid_total: 3333 })).toEqual({
      commission_amount: 500, // round(499.95)
      payout_amount: 2833,
    })
  })
})

describe("isWorkDelivered", () => {
  it("montaj_yapildi/tamamlandi true; öncesi false", () => {
    expect(isWorkDelivered({ status: "montaj_yapildi" })).toBe(true)
    expect(isWorkDelivered({ status: "tamamlandi" })).toBe(true)
    expect(isWorkDelivered({ status: "tedarik" })).toBe(false)
  })
})

// ── In-memory mock module service ──
function makeSvc(initial: any) {
  const store: Record<string, any> = { [initial.id]: { ...initial } }
  return {
    store,
    async retrieveServiceRequest(id: string) {
      if (!store[id]) throw new Error("not found")
      return { ...store[id] }
    },
    async updateServiceRequests(u: any) {
      store[u.id] = { ...store[u.id], ...u }
    },
  }
}

describe("applyServicePayment", () => {
  it("tahsilatı işler, paid_total + payment_status tazeler", async () => {
    const svc = makeSvc({
      id: ID,
      commission_rate: 10,
      status: "onaylandi",
      deposit_amount: 2000,
      payout_status: "pending",
      payments: [],
    })
    await applyServicePayment(svc, await svc.retrieveServiceRequest(ID), {
      phase: "deposit",
      amount: 2000,
      merchant_oid: encodeServiceOid(ID, "deposit"),
      method: "paytr",
    })
    const r = svc.store[ID]
    expect(r.paid_total).toBe(2000)
    expect(r.payment_status).toBe("deposit_paid")
    expect(r.payments).toHaveLength(1)
    expect(r.payout_status).toBe("pending") // iş henüz teslim değil
  })

  it("idempotent: aynı merchant_oid ikinci kez işlenmez", async () => {
    const oid = encodeServiceOid(ID, "survey")
    const svc = makeSvc({ id: ID, survey_fee: 500, payout_status: "pending", payments: [] })
    const args = { phase: "survey" as const, amount: 500, merchant_oid: oid, method: "paytr" as const }
    const first = await applyServicePayment(svc, await svc.retrieveServiceRequest(ID), args)
    const second = await applyServicePayment(svc, await svc.retrieveServiceRequest(ID), args)
    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(svc.store[ID].payments).toHaveLength(1)
    expect(svc.store[ID].paid_total).toBe(500)
  })

  it("tam ödeme + iş teslim → payout eligible + komisyon/net hesaplanır", async () => {
    const svc = makeSvc({
      id: ID,
      commission_rate: 10,
      status: "montaj_yapildi",
      deposit_amount: 2000,
      balance_amount: 3000,
      payout_status: "pending",
      payments: [{ phase: "deposit", amount: 2000, status: "paid", merchant_oid: "x" }],
    })
    await applyServicePayment(svc, await svc.retrieveServiceRequest(ID), {
      phase: "balance",
      amount: 3000,
      merchant_oid: encodeServiceOid(ID, "balance"),
      method: "paytr",
    })
    const r = svc.store[ID]
    expect(r.paid_total).toBe(5000)
    expect(r.payment_status).toBe("paid")
    expect(r.payout_status).toBe("eligible")
    expect(r.commission_amount).toBe(500)
    expect(r.payout_amount).toBe(4500)
  })
})

describe("refreshServicePayout", () => {
  it("tam ödeme ama iş teslim değilse eligible YAPMAZ", async () => {
    const svc = makeSvc({
      id: ID,
      commission_rate: 10,
      status: "onaylandi",
      payout_status: "pending",
      paid_total: 5000,
      payments: [{ phase: "balance", status: "paid" }],
    })
    await refreshServicePayout(svc, ID)
    expect(svc.store[ID].payout_status).toBe("pending")
  })

  it("iş teslim sonrası status ilerleyince eligible olur", async () => {
    const svc = makeSvc({
      id: ID,
      commission_rate: 10,
      status: "tamamlandi",
      payout_status: "pending",
      paid_total: 5000,
      payments: [{ phase: "balance", status: "paid" }],
    })
    await refreshServicePayout(svc, ID)
    expect(svc.store[ID].payout_status).toBe("eligible")
    expect(svc.store[ID].payout_amount).toBe(4500)
  })

  it("zaten paid olanı geri almaz", async () => {
    const svc = makeSvc({
      id: ID,
      commission_rate: 10,
      status: "tamamlandi",
      payout_status: "paid",
      paid_total: 5000,
      payments: [{ phase: "balance", status: "paid" }],
    })
    await refreshServicePayout(svc, ID)
    expect(svc.store[ID].payout_status).toBe("paid")
  })
})
