import {
  sha512Base64,
  buildInitRequestHash,
  buildCancelRefundHash,
} from "../paynkolay-hash"

/**
 * Para akışı imza (hash) regresyon kilidi. Aşağıdaki beklenen değerler bilinen
 * girdilerden SHA-512→base64 ile üretildi. Formül DEĞİŞİRSE bu testler kırılır —
 * Paynkolay imzasının yanlışlıkla bozulup ödeme/iade'nin reddedilmesini önler.
 */
describe("paynkolay-hash", () => {
  const sx = "TESTSX"
  const secretKey = "SECRET"

  it("sha512Base64 bilinen string için sabit base64 üretir", () => {
    // echo -n "a" | openssl dgst -sha512 -binary | base64
    expect(sha512Base64("a")).toBe(
      "H0D8ktokFpR1CXnubPWC8tXX0o4YM13gWrxU0FYOD1MChgxlK/CNVgJSql50IQVG82n7u86MEs/HlXsmUv6adQ=="
    )
  })

  it("init-request hash: kart saklama YOK (customerKey boş)", () => {
    expect(
      buildInitRequestHash({
        sx,
        clientRefCode: "REF123",
        amount: "100.00",
        successUrl: "https://shop.example/ok",
        failUrl: "https://shop.example/fail",
        rnd: "RND1",
        customerKey: "",
        secretKey,
      })
    ).toBe("PTbPE5NUlG1JpUh5jktQcKdffxzzp5NzOZ/wqXoiavsarm2eNVlppcXJm7v0LGL5UAAo5j/Q2fpKmZ8ugnihyg==")
  })

  it("init-request hash: kart saklama VAR (customerKey dolu) farklı imza üretir", () => {
    const empty = buildInitRequestHash({
      sx, clientRefCode: "REF123", amount: "100.00",
      successUrl: "https://shop.example/ok", failUrl: "https://shop.example/fail",
      rnd: "RND1", customerKey: "", secretKey,
    })
    const withKey = buildInitRequestHash({
      sx, clientRefCode: "REF123", amount: "100.00",
      successUrl: "https://shop.example/ok", failUrl: "https://shop.example/fail",
      rnd: "RND1", customerKey: "5551112233", secretKey,
    })
    expect(withKey).toBe("UeAn6+PRRicSxHnNbDWEiaf9c+cwemvJB0hvAHzSYuLD5YZauzBnE7H4MhcxymqkuaWiXIbXLWILM0cyiElYBg==")
    // Kritik: customerKey imzaya GİRMELİ → iki imza farklı olmalı (save-card bug'ı regresyonu).
    expect(withKey).not.toBe(empty)
  })

  it("iade (refund) hash sabittir", () => {
    expect(
      buildCancelRefundHash({
        sx, referenceCode: "REFC1", type: "refund", amount: "50.00",
        trxDate: "2026.06.10", secretKey,
      })
    ).toBe("SLf11eXw6HZtqa35XktAWNgSL31EsBUjI59eTs1x/KC9g4SkSkHfEm774ZswFEufVkRctZCeuHjgRcL/nujM9A==")
  })

  it("iptal (cancel) hash, iade'den FARKLI imza üretir (type alanı imzayı değiştirir)", () => {
    const refund = buildCancelRefundHash({
      sx, referenceCode: "REFC1", type: "refund", amount: "50.00", trxDate: "2026.06.10", secretKey,
    })
    const cancel = buildCancelRefundHash({
      sx, referenceCode: "REFC1", type: "cancel", amount: "50.00", trxDate: "2026.06.10", secretKey,
    })
    expect(cancel).toBe("z6sp5ZWw7JANOO/9SICl8bijVXaMyM1CwUBPpavxod57jaaKbNyMUsXjSfQLHe1J5GnjqTZPsx5UjL0q9hPgIA==")
    expect(cancel).not.toBe(refund)
  })
})
