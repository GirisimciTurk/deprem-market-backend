import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { getPayTRConfig } from "../../../../lib/paytr-config"
import { buildGetTokenHash } from "../../../../lib/paytr-hash"
import { hashLimiter, enforceRateLimit } from "../../../../lib/rate-limiter"

const bodySchema = z.object({
  cart_id: z.string().min(1).max(128),
})

/**
 * POST /store/paytr/token  { cart_id }
 * Sepetten PayTR iFrame ödeme token'ı üretir. Frontend dönen iframe_token ile
 * PayTR iframe'ini açar. merchant_oid = PayTR'a giden benzersiz referans = ödeme
 * oturumu id'sinin alfa-numerik hali (callback bunu geri çözer).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(hashLimiter, req, res)) return

  const logger = req.scope.resolve("logger")
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Geçersiz sepet." })
  }

  const cfg = getPayTRConfig()
  if (!cfg.configured) {
    return res
      .status(503)
      .json({ success: false, error: "PayTR yapılandırılmamış." })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "email",
      "currency_code",
      "total",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.address_1",
      "shipping_address.city",
      "shipping_address.phone",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.status",
    ],
    filters: { id: parsed.data.cart_id },
  })

  const cart = carts?.[0]
  if (!cart) {
    return res.status(404).json({ success: false, error: "Sepet bulunamadı." })
  }

  // PayTR ödeme oturumunu bul (frontend ödeme yöntemi seçince oluşturur).
  const sessions = (cart.payment_collection?.payment_sessions || []) as any[]
  const session = sessions.find(
    (s) => s.provider_id === "paytr" || s.provider_id?.includes("paytr")
  )
  if (!session) {
    return res
      .status(400)
      .json({ success: false, error: "PayTR ödeme oturumu bulunamadı." })
  }

  // merchant_oid: yalnız alfa-numerik (PayTR şartı). Oturum id'sindeki '_' atılır;
  // callback'te 'payses_' öneki yeniden eklenerek geri çözülür.
  const merchantOid = String(session.id).replace(/[^a-zA-Z0-9]/g, "")

  const email = cart.email || "musteri@depremtek.market"
  const total = Math.round(Number(cart.total ?? 0)) // kuruş
  if (!total || total <= 0) {
    return res.status(400).json({ success: false, error: "Geçersiz tutar." })
  }
  const paymentAmount = String(total) // PayTR: TL×100 = kuruş (bizde zaten kuruş)

  // Sepet: [[ürün adı, birim fiyat TL, adet], ...] → base64
  const basket = (cart.items || []).map((it: any) => [
    String(it.title || "Ürün").slice(0, 100),
    (Number(it.unit_price ?? 0) / 100).toFixed(2),
    Number(it.quantity ?? 1),
  ])
  const userBasket = Buffer.from(JSON.stringify(basket)).toString("base64")

  const rawIp =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket?.remoteAddress ||
    "0.0.0.0"
  const userIp = rawIp.split(",")[0].trim()

  const userName =
    [cart.shipping_address?.first_name, cart.shipping_address?.last_name]
      .filter(Boolean)
      .join(" ") || "Müşteri"
  const userAddress = cart.shipping_address?.address_1 || "-"
  const userPhone = cart.shipping_address?.phone || "0000000000"

  const token = buildGetTokenHash({
    merchantId: cfg.merchantId,
    userIp,
    merchantOid,
    email,
    paymentAmount,
    userBasket,
    noInstallment: "0",
    maxInstallment: "0",
    currency: "TL",
    testMode: cfg.testMode,
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
  })

  const form = new URLSearchParams()
  form.append("merchant_id", cfg.merchantId)
  form.append("merchant_oid", merchantOid)
  form.append("email", email)
  form.append("payment_amount", paymentAmount)
  form.append("paytr_token", token)
  form.append("user_basket", userBasket)
  form.append("no_installment", "0")
  form.append("max_installment", "0")
  form.append("user_name", userName)
  form.append("user_address", userAddress)
  form.append("user_phone", userPhone)
  form.append("user_ip", userIp)
  form.append("merchant_ok_url", cfg.okUrl)
  form.append("merchant_fail_url", cfg.failUrl)
  form.append("timeout_limit", "30")
  form.append("currency", "TL")
  form.append("test_mode", cfg.testMode)
  form.append("debug_on", cfg.isProduction ? "0" : "1")

  try {
    const r = await fetch(`${cfg.baseUrl}/odeme/api/get-token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const json: any = await r.json().catch(() => ({}))
    if (json.status !== "success") {
      logger.error(`PayTR get-token başarısız: ${json.reason || JSON.stringify(json)}`)
      return res
        .status(502)
        .json({ success: false, error: json.reason || "PayTR token alınamadı." })
    }

    // merchant_oid'i oturum verisine yaz (refund/transfer geri-izleme için).
    try {
      const paymentModule = req.scope.resolve(Modules.PAYMENT)
      await paymentModule.updatePaymentSession({
        id: session.id,
        currency_code: cart.currency_code || "try",
        amount: total,
        data: {
          ...((session.data as Record<string, unknown>) || {}),
          merchant_oid: merchantOid,
          provider: "paytr",
        },
      } as any)
    } catch (e: any) {
      logger.warn(`PayTR token: oturum verisi güncellenemedi: ${e?.message}`)
    }

    return res.status(200).json({ success: true, iframe_token: json.token })
  } catch (e: any) {
    logger.error(`PayTR get-token hata: ${e?.message}`)
    return res
      .status(500)
      .json({ success: false, error: "PayTR token oluşturulamadı." })
  }
}
