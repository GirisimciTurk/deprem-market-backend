import {
  DEFAULT_PUSH_LOCALE,
  groupByLocale,
  backInStockPayload,
  cartRecoveryPayload,
  fallbackProductName,
  normalizePushLocale,
  orderPushPayload,
  productUrl,
} from "../push-i18n"

describe("normalizePushLocale", () => {
  it("desteklenen dilleri aynen döner", () => {
    expect(normalizePushLocale("tr")).toBe("tr")
    expect(normalizePushLocale("en")).toBe("en")
  })

  it("bölge ekli ve büyük harfli girdileri indirger", () => {
    expect(normalizePushLocale("tr-TR")).toBe("tr")
    expect(normalizePushLocale("en_US")).toBe("en")
    expect(normalizePushLocale("EN")).toBe("en")
  })

  it("bilinmeyen/boş girdide varsayılana düşer", () => {
    // Abonelik locale'i null olabilir (eski kayıtlar) — bildirim yine gitmeli.
    expect(normalizePushLocale(null)).toBe(DEFAULT_PUSH_LOCALE)
    expect(normalizePushLocale(undefined)).toBe(DEFAULT_PUSH_LOCALE)
    expect(normalizePushLocale("")).toBe(DEFAULT_PUSH_LOCALE)
    expect(normalizePushLocale("de")).toBe(DEFAULT_PUSH_LOCALE)
  })
})

describe("productUrl", () => {
  it("ÜLKE KODU önekli ürün yolu kurar (dil değil)", () => {
    // Yol öneki app/[countryCode] segmentidir; next-intl URL routing kullanmıyor.
    // "/en/products/..." diye bir rota YOK — dil yalnız metni etkiler.
    expect(productUrl("deprem-cantasi")).toBe("/tr/products/deprem-cantasi")
  })

  it("handle yoksa mağazaya düşer", () => {
    expect(productUrl(null)).toBe("/tr/store")
    expect(productUrl(undefined)).toBe("/tr/store")
  })

  it("çok bölgeli yayında ülke kodu dışarıdan verilebilir", () => {
    expect(productUrl("x", "de")).toBe("/de/products/x")
  })
})

describe("backInStockPayload", () => {
  const input = {
    productTitle: "Deprem Çantası",
    productHandle: "deprem-cantasi",
    variantId: "variant_1",
  }

  it("Türkçe abonelikte Türkçe metin ve /tr hedefi üretir", () => {
    const p = backInStockPayload("tr", input)
    expect(p.title).toContain("Stoğa geldi")
    expect(p.body).toContain("Deprem Çantası")
    expect(p.url).toBe("/tr/products/deprem-cantasi")
    expect(p.actions[0].title).toBe("Ürüne git")
  })

  it("İngilizce abonelikte İngilizce METİN üretir, hedef yol değişmez", () => {
    // Regresyon: eskiden herkese sabit Türkçe metin + /tr/ bağlantısı gidiyordu.
    const p = backInStockPayload("en", input)
    expect(p.title).toContain("Back in stock")
    expect(p.body).toContain("available again")
    // Metin İngilizce ama HEDEF YOL ülke kodunda kalır (rota dile göre değişmiyor).
    expect(p.url).toBe("/tr/products/deprem-cantasi")
    expect(p.actions[0].title).toBe("View product")
  })

  it("aynı varyant için aynı tag'i kullanır (bildirim üst üste yığılmaz)", () => {
    expect(backInStockPayload("tr", input).tag).toBe("stock-variant_1")
    expect(backInStockPayload("en", input).tag).toBe("stock-variant_1")
  })

  it("ürün adı yoksa yedek ad dile göre gelir", () => {
    expect(fallbackProductName("tr")).toBe("Beklediğiniz ürün")
    expect(fallbackProductName("en")).toBe("The product you were waiting for")
  })
})

describe("orderPushPayload", () => {
  const input = { orderNo: "1042", orderId: "order_1" }

  it("her durum için Türkçe metin üretir", () => {
    const durumlar = ["placed", "shipped", "delivered", "canceled"] as const
    for (const status of durumlar) {
      const p = orderPushPayload("tr", { ...input, status })
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.body).toContain("#1042")
    }
  })

  it("İngilizce abonelikte İngilizce metin üretir", () => {
    // Regresyon: sipariş bildirimleri herkese sabit Türkçe gidiyordu.
    const p = orderPushPayload("en", { ...input, status: "shipped" })
    expect(p.title).toBe("Order shipped 🚚")
    expect(p.body).toContain("#1042")
    expect(p.actions[0].title).toBe("View order")
  })

  it("hedef yol ülke kodunda kalır, dile göre değişmez", () => {
    expect(orderPushPayload("tr", { ...input, status: "placed" }).url).toBe(
      "/tr/account/orders/details/order_1"
    )
    expect(orderPushPayload("en", { ...input, status: "placed" }).url).toBe(
      "/tr/account/orders/details/order_1"
    )
  })

  it("iptalde buton sipariş listesine gider", () => {
    const p = orderPushPayload("en", { ...input, status: "canceled" })
    expect(p.actions[0].action).toBe("orders")
    expect(p.actions[0].url).toBe("/tr/account/orders")
  })

  it("aynı sipariş için aynı tag kullanılır", () => {
    expect(orderPushPayload("tr", { ...input, status: "placed" }).tag).toBe(
      "order-order_1"
    )
  })
})

describe("cartRecoveryPayload", () => {
  it("ürün sayısını metne koyar ve dile göre değişir", () => {
    const tr = cartRecoveryPayload("tr", { itemCount: 3, cartId: "cart_1" })
    expect(tr.body).toContain("3")
    expect(tr.title).toBe("Sepetiniz sizi bekliyor 🛒")

    const en = cartRecoveryPayload("en", { itemCount: 3, cartId: "cart_1" })
    expect(en.body).toContain("3")
    expect(en.title).toBe("Your cart is waiting 🛒")
  })

  it("hedef sepet yolu ülke kodunda kalır", () => {
    expect(cartRecoveryPayload("en", { itemCount: 1, cartId: "c" }).url).toBe(
      "/tr/cart"
    )
  })

  it("sepet başına tekil tag kullanır", () => {
    expect(cartRecoveryPayload("tr", { itemCount: 1, cartId: "cart_9" }).tag).toBe(
      "cart-recovery-cart_9"
    )
  })
})

describe("groupByLocale", () => {
  it("abonelikleri diline göre ayırır", () => {
    const subs = [
      { endpoint: "a", locale: "tr" },
      { endpoint: "b", locale: "en" },
      { endpoint: "c", locale: "tr" },
    ]
    const g = groupByLocale(subs)
    expect(g.get("tr")!.map((s) => s.endpoint)).toEqual(["a", "c"])
    expect(g.get("en")!.map((s) => s.endpoint)).toEqual(["b"])
  })

  it("locale yok/bilinmiyorsa varsayılan gruba düşer", () => {
    const g = groupByLocale([
      { endpoint: "a", locale: null },
      { endpoint: "b" },
      { endpoint: "c", locale: "de" },
      { endpoint: "d", locale: "tr-TR" },
    ])
    expect(g.size).toBe(1)
    expect(g.get(DEFAULT_PUSH_LOCALE)!.map((s) => s.endpoint)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
  })

  it("boş girdide boş harita döner", () => {
    expect(groupByLocale([]).size).toBe(0)
  })
})
