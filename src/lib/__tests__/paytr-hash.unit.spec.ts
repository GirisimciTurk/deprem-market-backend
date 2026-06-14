import {
  buildGetTokenHash,
  buildCallbackHash,
  buildTransferHash,
  buildRefundHash,
  buildReturnedTransfersHash,
  buildResendHash,
} from "../paytr-hash"

/**
 * PayTR imza formüllerini bilinen girdi→çıktı eşlemesiyle KİLİTLER. Beklenen
 * base64 değerleri sabit test kimlikleriyle (key=TESTKEY, salt=TESTSALT,
 * mid=123456) bağımsız HMAC-SHA256 hesabından üretildi. Bir formül (alan sırası,
 * salt konumu, key) yanlışlıkla değişirse bu testler kırılır.
 */
const KEY = "TESTKEY"
const SALT = "TESTSALT"
const MID = "123456"

describe("PayTR hash formülleri (kilitli)", () => {
  it("get-token imzası", () => {
    expect(
      buildGetTokenHash({
        merchantId: MID,
        userIp: "1.2.3.4",
        merchantOid: "ORDER1",
        email: "a@b.com",
        paymentAmount: "10000",
        userBasket: "W10=",
        noInstallment: "0",
        maxInstallment: "0",
        currency: "TL",
        testMode: "1",
        merchantKey: KEY,
        merchantSalt: SALT,
      })
    ).toBe("Ie9bXfkWlQC2AhLsZedqeqi80MorpL4bNUgZpmzO9bo=")
  })

  it("callback imzası (salt gövde içinde)", () => {
    expect(
      buildCallbackHash({
        merchantOid: "ORDER1",
        status: "success",
        totalAmount: "10000",
        merchantKey: KEY,
        merchantSalt: SALT,
      })
    ).toBe("T+6GfkKNzrJ/vkpvCGEu24AAxbbrZTtcxalMYYB29dM=")
  })

  it("platform transfer imzası", () => {
    expect(
      buildTransferHash({
        merchantId: MID,
        merchantOid: "ORDER1",
        transId: "T1",
        submerchantAmount: "900000",
        totalAmount: "1000000",
        transferName: "Ali Veli",
        transferIban: "TR000000000000000000000000",
        merchantKey: KEY,
        merchantSalt: SALT,
      })
    ).toBe("3vZHe+EQY2Hi/WR2wBVKaqouQRq4sos68IuKCNqDMDY=")
  })

  it("iade imzası", () => {
    expect(
      buildRefundHash({
        merchantId: MID,
        merchantOid: "ORDER1",
        returnAmount: "50.00",
        merchantKey: KEY,
        merchantSalt: SALT,
      })
    ).toBe("9qUqdodrBR2hFt5qnBXpniwnsDe+nPgQRL3tJKT++N8=")
  })

  it("geri dönen transfer listesi imzası", () => {
    expect(
      buildReturnedTransfersHash({
        merchantId: MID,
        startDate: "2026-06-01",
        endDate: "2026-06-14",
        merchantKey: KEY,
        merchantSalt: SALT,
      })
    ).toBe("P/hOM6MIVVuWYIASb8Pjvqu1tsXOlWgYHjPQXkMM2EA=")
  })

  it("hesaptan gönder (resend) imzası", () => {
    expect(
      buildResendHash({
        merchantId: MID,
        transId: "T1",
        merchantKey: KEY,
        merchantSalt: SALT,
      })
    ).toBe("cnJKjXUSILLp5kMI7ceyjWk+cV9DrUCDHMyFgkRUHF8=")
  })
})
