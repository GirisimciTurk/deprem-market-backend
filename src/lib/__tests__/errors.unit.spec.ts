import { errorMessage } from "../errors"

/**
 * `errorMessage` bir hata sınıfını kapatmak için yazıldı: kod tabanında 83 yerde
 * `catch (e: any)` + `e?.message` vardı ve atılan şey Error DEĞİLSE bu ifade
 * sessizce `undefined` üretiyordu — log ve kullanıcı mesajları düz metin
 * "undefined" oluyordu. Testler tam da bu Error-olmayan yolları koruyor.
 */
describe("errorMessage", () => {
  it("Error'ın mesajını döndürür", () => {
    expect(errorMessage(new Error("Bağlantı koptu"))).toBe("Bağlantı koptu")
  })

  it("mesajsız Error'da yedeğe düşer", () => {
    expect(errorMessage(new Error(""))).toBe("Bilinmeyen hata")
    expect(errorMessage(new Error(""), "Özel yedek")).toBe("Özel yedek")
  })

  it("atılan string'in kendisini döndürür", () => {
    expect(errorMessage("düz metin hata")).toBe("düz metin hata")
  })

  it("boş/boşluklu string'de yedeğe düşer", () => {
    expect(errorMessage("   ", "Yedek")).toBe("Yedek")
  })

  it("Error olmayan nesnedeki message alanını okur (axios/SDK hataları)", () => {
    expect(errorMessage({ message: "İstek başarısız", status: 500 })).toBe(
      "İstek başarısız"
    )
  })

  it("message'ı olmayan nesneyi JSON olarak gösterir — bilgi kaybolmasın", () => {
    expect(errorMessage({ code: "ECONNRESET" })).toBe('{"code":"ECONNRESET"}')
  })

  it("boş nesnede yedeğe düşer (JSON '{}' bilgi taşımaz)", () => {
    expect(errorMessage({}, "Yedek")).toBe("Yedek")
  })

  it("döngüsel referansta çökmez", () => {
    const a: Record<string, unknown> = { x: 1 }
    a.self = a
    expect(errorMessage(a, "Yedek")).toBe("Yedek")
  })

  it.each<[unknown, string]>([
    [null, "null"],
    [undefined, "undefined"],
    [0, "sayı 0"],
    [false, "boolean"],
  ])("Error olmayan ilkel değerde yedeğe düşer (%s)", (value, _label) => {
    expect(errorMessage(value, "Yedek")).toBe("Yedek")
  })

  it("ASLA undefined döndürmez — asıl düzeltilen hata buydu", () => {
    for (const v of [null, undefined, 0, "", {}, [], new Error("")]) {
      expect(typeof errorMessage(v)).toBe("string")
    }
  })
})
