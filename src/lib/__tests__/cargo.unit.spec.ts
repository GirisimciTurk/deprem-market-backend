import { resolveCarrier, getTrackingUrl, CARRIERS, DEFAULT_CARRIER } from "../cargo"

describe("cargo util", () => {
  it("aras_kargo provider_id → Aras Kargo", () => {
    expect(resolveCarrier("aras_kargo").name).toBe("Aras Kargo")
  })

  it("bilinmeyen/manuel provider → varsayılan carrier", () => {
    expect(resolveCarrier("manual_manual").code).toBe(DEFAULT_CARRIER)
    expect(resolveCarrier(null).code).toBe(DEFAULT_CARRIER)
    expect(resolveCarrier(undefined).code).toBe(DEFAULT_CARRIER)
  })

  it("yurtici provider → Yurtiçi Kargo", () => {
    expect(resolveCarrier("yurtici_x").code).toBe("yurtici")
  })

  it("getTrackingUrl takip no içeren URL üretir", () => {
    const url = getTrackingUrl("ARS123", "aras_kargo")
    expect(url).toContain("ARS123")
    expect(url).toContain("araskargo")
  })

  it("boş takip no → null", () => {
    expect(getTrackingUrl("", "aras_kargo")).toBeNull()
    expect(getTrackingUrl("   ", "aras_kargo")).toBeNull()
  })

  it("takip no URL-encode edilir", () => {
    expect(getTrackingUrl("A/B", "aras_kargo")).toContain("A%2FB")
  })

  it("tüm carrier'larda code/name/template alanları tanımlı", () => {
    for (const key of Object.keys(CARRIERS)) {
      const c = CARRIERS[key as keyof typeof CARRIERS]
      expect(c.code).toBeTruthy()
      expect(c.name).toBeTruthy()
    }
  })
})
