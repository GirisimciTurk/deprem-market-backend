import { resolveCarrier, getTrackingUrl, CARRIERS, DEFAULT_CARRIER } from "../cargo"

describe("cargo util", () => {
  it("yurtici_kargo provider_id → Yurtiçi Kargo", () => {
    expect(resolveCarrier("yurtici_kargo").name).toBe("Yurtiçi Kargo")
  })

  it("bilinmeyen/manuel provider → varsayılan carrier (Yurtiçi)", () => {
    expect(resolveCarrier("manual_manual").code).toBe(DEFAULT_CARRIER)
    expect(resolveCarrier(null).code).toBe(DEFAULT_CARRIER)
    expect(resolveCarrier(undefined).code).toBe(DEFAULT_CARRIER)
    expect(DEFAULT_CARRIER).toBe("yurtici")
  })

  it("mng provider → MNG Kargo", () => {
    expect(resolveCarrier("mng_x").code).toBe("mng")
  })

  it("getTrackingUrl takip no içeren URL üretir", () => {
    const url = getTrackingUrl("YK123", "yurtici_kargo")
    expect(url).toContain("YK123")
    expect(url).toContain("yurticikargo")
  })

  it("boş takip no → null", () => {
    expect(getTrackingUrl("", "yurtici_kargo")).toBeNull()
    expect(getTrackingUrl("   ", "yurtici_kargo")).toBeNull()
  })

  it("takip no URL-encode edilir", () => {
    expect(getTrackingUrl("A/B", "yurtici_kargo")).toContain("A%2FB")
  })

  it("tüm carrier'larda code/name/template alanları tanımlı", () => {
    for (const key of Object.keys(CARRIERS)) {
      const c = CARRIERS[key as keyof typeof CARRIERS]
      expect(c.code).toBeTruthy()
      expect(c.name).toBeTruthy()
    }
  })
})
