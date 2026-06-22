import {
  pickDims,
  unitDesi,
  volumetricDesi,
  computeCargoFee,
  DEFAULT_CARGO_TARIFF,
} from "../cargo-fee"

describe("cargo-fee: volumetricDesi / unitDesi", () => {
  it("hacimsel desi = en×boy×yük / 3000", () => {
    expect(volumetricDesi(30, 30, 30)).toBeCloseTo(9, 5) // 27000/3000
    expect(volumetricDesi(50, 50, 50)).toBeCloseTo(41.667, 2)
  })

  it("boyut eksik/0 ise hacimsel desi 0", () => {
    expect(volumetricDesi(0, 30, 30)).toBe(0)
    expect(volumetricDesi(30, null, 30)).toBe(0)
    expect(volumetricDesi(undefined, undefined, undefined)).toBe(0)
  })

  it("birim desi = max(hacimsel, kg)", () => {
    // 2000gr = 2kg, hacimsel 9 → 9 kazanır
    expect(unitDesi({ grams: 2000, lengthCm: 30, widthCm: 30, heightCm: 30 })).toBeCloseTo(9, 5)
    // 5000gr = 5kg, hacimsel 0.6 → ağırlık kazanır
    expect(unitDesi({ grams: 5000, lengthCm: 15, widthCm: 15, heightCm: 8 })).toBeCloseTo(5, 5)
    // boyut yok → yalnız ağırlık
    expect(unitDesi({ grams: 3000 })).toBeCloseTo(3, 5)
  })
})

describe("cargo-fee: pickDims (varyant öncelikli, ürün fallback)", () => {
  it("varyant boyutu varsa onu kullanır", () => {
    const d = pickDims(
      { weight: 900, length: 40, width: 35, height: 25 },
      { weight: 500, length: 20, width: 20, height: 10 }
    )
    expect(d).toEqual({ grams: 900, lengthCm: 40, widthCm: 35, heightCm: 25 })
  })

  it("varyant boyutu yoksa ÜRÜN boyutuna düşer (kritik bug fix)", () => {
    // Varyant boyutsuz doğar → ürün boyutu kullanılmalı (yoksa hacimsel desi 0)
    const d = pickDims(
      { weight: null, length: null, width: null, height: null },
      { weight: 500, length: 20, width: 20, height: 10 }
    )
    expect(d).toEqual({ grams: 500, lengthCm: 20, widthCm: 20, heightCm: 10 })
  })

  it("alan bazında bağımsız fallback (kısmi varyant boyutu)", () => {
    // Varyantta yalnız ağırlık var; ölçüler üründen gelmeli
    const d = pickDims(
      { weight: 800 },
      { weight: 500, length: 20, width: 20, height: 10 }
    )
    expect(d).toEqual({ grams: 800, lengthCm: 20, widthCm: 20, heightCm: 10 })
  })

  it("varyant da ürün de yoksa 0", () => {
    expect(pickDims(null, null)).toEqual({ grams: 0, lengthCm: 0, widthCm: 0, heightCm: 0 })
    expect(pickDims(undefined, {})).toEqual({ grams: 0, lengthCm: 0, widthCm: 0, heightCm: 0 })
  })

  it("0 değeri geçerli sayılır (?? yalnız null/undefined'da düşer)", () => {
    // variant.weight = 0 → 0 kullanılır (ürüne düşmez); ölçüler null → ürüne düşer
    const d = pickDims({ weight: 0, length: null }, { weight: 999, length: 50 })
    expect(d.grams).toBe(0)
    expect(d.lengthCm).toBe(50)
  })
})

describe("cargo-fee: per-varyant desi farklı ücret üretir (uçtan uca senaryo)", () => {
  it("küçük varyant vs büyük varyant → farklı kargo ücreti", () => {
    const small = pickDims({ weight: 300, length: 15, width: 15, height: 8 }, null)
    const big = pickDims({ weight: 900, length: 40, width: 35, height: 25 }, null)
    const feeSmall = computeCargoFee(DEFAULT_CARGO_TARIFF, unitDesi(small))
    const feeBig = computeCargoFee(DEFAULT_CARGO_TARIFF, unitDesi(big))
    expect(unitDesi(small)).toBeCloseTo(0.6, 2)
    expect(unitDesi(big)).toBeCloseTo(11.667, 2)
    // Büyük varyant daha pahalı kargo öder — per-varyant desinin tüm amacı bu.
    expect(feeBig).toBeGreaterThan(feeSmall)
  })

  it("boyutsuz varyant + ürün boyutu → ürün desisiyle ücretlenir (eski bug: 0 desi)", () => {
    const dims = pickDims({}, { weight: 100, length: 40, width: 30, height: 20 })
    // Eski kodda variant.length yok → 0 → yalnız ağırlık (0.1kg). Şimdi ürün boyutu → hacimsel 8.
    expect(unitDesi(dims)).toBeCloseTo(8, 5)
  })
})
