import {
  STAGE_LABELS,
  aggregateStage,
  sellerOrderStage,
  stageLabel,
} from "../order-stage"

describe("sellerOrderStage", () => {
  it("yeni sipariş: satıcı dokunmadıysa 'Sipariş Alındı'", () => {
    expect(sellerOrderStage({ fulfillment_status: "pending", preparing_at: null })).toBe(
      "received"
    )
  })

  it("preparing_at damgalıysa 'Hazırlanıyor'", () => {
    expect(
      sellerOrderStage({ fulfillment_status: "pending", preparing_at: new Date() })
    ).toBe("preparing")
  })

  it("fulfilled ise 'Kargoya Verildi'", () => {
    expect(
      sellerOrderStage({ fulfillment_status: "fulfilled", preparing_at: new Date() })
    ).toBe("shipped")
  })

  it("satıcı 'Hazırlanıyor'a basmadan kargolarsa yine 'Kargoya Verildi'", () => {
    // Aşama atlanabilir olmalı — satıcıyı iki tıka zorlamıyoruz.
    expect(
      sellerOrderStage({ fulfillment_status: "fulfilled", preparing_at: null })
    ).toBe("shipped")
  })

  it("iptal her şeyi ezer", () => {
    expect(
      sellerOrderStage({ fulfillment_status: "canceled", preparing_at: new Date() })
    ).toBe("canceled")
  })

  it("ISO string damgası da kabul edilir (API'den gelen hâli)", () => {
    expect(
      sellerOrderStage({
        fulfillment_status: "pending",
        preparing_at: "2026-07-30T10:00:00.000Z",
      })
    ).toBe("preparing")
  })

  it("eksik/bozuk alanlarda en güvenli aşamaya düşer", () => {
    expect(sellerOrderStage({})).toBe("received")
    expect(sellerOrderStage({ fulfillment_status: null, preparing_at: null })).toBe(
      "received"
    )
  })
})

describe("aggregateStage — çok satıcılı siparişte tek aşama", () => {
  it("alt-sipariş yoksa null döner (çağıran eski davranışına düşer)", () => {
    expect(aggregateStage([])).toBeNull()
  })

  it("tek satıcı: kendi aşamasını verir", () => {
    expect(
      aggregateStage([{ fulfillment_status: "fulfilled", preparing_at: null }])
    ).toBe("shipped")
  })

  it("EN GERİDE olanı verir — biri kargolandı biri hazırlanıyorsa 'Hazırlanıyor'", () => {
    // Müşteri henüz gelmeyen paketi yolda sanmasın.
    expect(
      aggregateStage([
        { fulfillment_status: "fulfilled", preparing_at: new Date() },
        { fulfillment_status: "pending", preparing_at: new Date() },
      ])
    ).toBe("preparing")
  })

  it("biri hiç ellenmediyse 'Sipariş Alındı'da kalır", () => {
    expect(
      aggregateStage([
        { fulfillment_status: "fulfilled", preparing_at: new Date() },
        { fulfillment_status: "pending", preparing_at: null },
      ])
    ).toBe("received")
  })

  it("iptal alt-siparişler hesaba KATILMAZ", () => {
    // Bir satıcı iptal ettiyse diğerinin kargosu geriye çekilmemeli.
    expect(
      aggregateStage([
        { fulfillment_status: "canceled", preparing_at: null },
        { fulfillment_status: "fulfilled", preparing_at: new Date() },
      ])
    ).toBe("shipped")
  })

  it("hepsi iptalse 'İptal Edildi'", () => {
    expect(
      aggregateStage([
        { fulfillment_status: "canceled", preparing_at: null },
        { fulfillment_status: "canceled", preparing_at: null },
      ])
    ).toBe("canceled")
  })

  it("üç satıcıda da en geri kazanır", () => {
    expect(
      aggregateStage([
        { fulfillment_status: "fulfilled", preparing_at: new Date() },
        { fulfillment_status: "fulfilled", preparing_at: new Date() },
        { fulfillment_status: "pending", preparing_at: null },
      ])
    ).toBe("received")
  })
})

describe("etiketler", () => {
  it("her aşamanın Türkçe etiketi var", () => {
    expect(stageLabel("received")).toBe("Sipariş Alındı")
    expect(stageLabel("preparing")).toBe("Hazırlanıyor")
    expect(stageLabel("shipped")).toBe("Kargoya Verildi")
    expect(stageLabel("canceled")).toBe("İptal Edildi")
  })

  it("etiket tablosu aşama tipiyle tam örtüşür", () => {
    expect(Object.keys(STAGE_LABELS).sort()).toEqual(
      ["canceled", "preparing", "received", "shipped"].sort()
    )
  })
})
