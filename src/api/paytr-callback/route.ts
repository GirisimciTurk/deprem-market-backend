import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { getPayTRConfig } from "../../lib/paytr-config"
import { buildCallbackHash } from "../../lib/paytr-hash"
import { callbackLimiter } from "../../lib/rate-limiter"
import { SERVICE_REQUEST_MODULE } from "../../modules/service_request"
import type ServiceRequestModuleService from "../../modules/service_request/service"
import {
  applyServicePayment,
  decodeServiceOid,
  isServiceOid,
  phaseAmount,
} from "../_lib/service-payment"
import { sendServicePaymentEmail } from "../../lib/service-mail"

/**
 * POST /paytr-callback  (PayTR sunucu-sunucu bildirimi, x-www-form-urlencoded)
 * Alanlar: merchant_oid, status ("success"|"failed"), total_amount, hash, ...
 *
 * Akış: imza doğrula → başarılıysa ödeme oturumunu AUTHORIZED yap + sepeti
 * siparişe dönüştür. PayTR yeniden denemeyi durdurmak için yanıt gövdesi düz
 * "OK" olmalıdır. (Kullanıcı yönlendirmesi merchant_ok_url ile storefront'ta olur.)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger")

  const rawIp =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket?.remoteAddress ||
    "unknown_ip"
  const clientIp = rawIp.split(",")[0].trim()
  if (await callbackLimiter.isLimited(clientIp)) {
    logger.warn(`PayTR Callback: rate limit (${clientIp})`)
    return res.status(429).send("RATE_LIMIT")
  }

  const body = (req.body as any) || {}
  const merchantOid = String(body.merchant_oid || "")
  const status = String(body.status || "")
  const totalAmount = String(body.total_amount || "")
  const receivedHash = String(body.hash || "")

  if (!merchantOid || !receivedHash) {
    logger.warn("PayTR Callback: eksik alan (merchant_oid/hash)")
    return res.status(400).send("BAD_REQUEST")
  }

  const cfg = getPayTRConfig()
  if (!cfg.configured) {
    logger.error("PayTR Callback: yapılandırma yok")
    return res.status(503).send("NOT_CONFIGURED")
  }

  // 1. İmza doğrula (oid + salt + status + total_amount).
  const expected = buildCallbackHash({
    merchantOid,
    status,
    totalAmount,
    merchantKey: cfg.merchantKey,
    merchantSalt: cfg.merchantSalt,
  })
  if (expected !== receivedHash) {
    logger.error(`PayTR Callback: imza uyuşmuyor (oid: ${merchantOid})`)
    return res.status(400).send("BAD_HASH")
  }

  // Başarısız ödeme: onayla (OK), sipariş oluşturma.
  if (status !== "success") {
    logger.info(`PayTR Callback: ödeme başarısız (oid: ${merchantOid}, sebep: ${body.failed_reason_msg || "-"})`)
    return res.status(200).send("OK")
  }

  // ── Hizmet talebi (keşifli kurulum) ESCROW ödemesi: sepet akışından ayrı. ──
  // merchant_oid "srq" ile başlar → ortada sepet/sipariş yok; ödeme doğrudan
  // service_request'e (faz bazlı) işlenir.
  if (isServiceOid(merchantOid)) {
    try {
      const decoded = decodeServiceOid(merchantOid)
      if (!decoded) {
        logger.warn(`PayTR Callback: hizmet oid çözülemedi (${merchantOid})`)
        return res.status(200).send("OK")
      }
      const svc = req.scope.resolve<ServiceRequestModuleService>(SERVICE_REQUEST_MODULE)
      const r = await svc.retrieveServiceRequest(decoded.id).catch(() => null)
      if (!r) {
        logger.warn(`PayTR Callback: hizmet talebi yok (${decoded.id})`)
        return res.status(200).send("OK")
      }
      // Tutar: token anında yazılan pending kalemden (TL major); yoksa faz tutarı.
      const payments: any[] = Array.isArray((r as any).payments) ? (r as any).payments : []
      const pending = payments.find((p) => p?.merchant_oid === merchantOid)
      const amount = pending ? Number(pending.amount) : phaseAmount(r as any, decoded.phase)

      const { changed } = await applyServicePayment(svc, r, {
        phase: decoded.phase,
        amount,
        merchant_oid: merchantOid,
        method: "paytr",
      })
      if (changed) {
        logger.info(
          `PayTR Callback: hizmet ödemesi işlendi (talep ${decoded.id}, faz ${decoded.phase}, ${amount} TL)`
        )
        const after = await svc.retrieveServiceRequest(decoded.id).catch(() => null)
        sendServicePaymentEmail(req.scope, after ?? r, decoded.phase, amount).catch(() => {})
      }
      return res.status(200).send("OK")
    } catch (e: any) {
      logger.error(`PayTR Callback: hizmet ödemesi işlenemedi (${merchantOid}): ${e?.message}`)
      return res.status(200).send("OK")
    }
  }

  // 2. merchant_oid'den ödeme oturumu id'sini geri çöz: 'payses' + ulid → 'payses_' + ulid.
  const sessionId = merchantOid.startsWith("payses")
    ? `payses_${merchantOid.slice("payses".length)}`
    : merchantOid

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: paySessions } = await query.graph({
      entity: "payment_session",
      fields: ["id", "currency_code", "amount", "data", "payment_collection_id"],
      filters: { id: sessionId },
    })
    const paySession = paySessions?.[0]
    if (!paySession) {
      logger.warn(`PayTR Callback: ödeme oturumu yok (${sessionId})`)
      // OK döneriz ki PayTR durmasın; ama sipariş oluşmaz (manuel inceleme).
      return res.status(200).send("OK")
    }

    const { data: rel } = await query.graph({
      entity: "cart_payment_collection",
      fields: ["cart_id", "payment_collection_id"],
      filters: { payment_collection_id: paySession.payment_collection_id },
    })
    const cartId = rel?.[0]?.cart_id
    if (!cartId) {
      logger.warn(`PayTR Callback: sepet bağlantısı yok (collection ${paySession.payment_collection_id})`)
      return res.status(200).send("OK")
    }

    // 3. Ödeme oturumunu AUTHORIZED yap + merchant_oid'i veriye yaz (iade için).
    const paymentModule = req.scope.resolve(Modules.PAYMENT)
    await paymentModule.updatePaymentSession({
      id: paySession.id,
      currency_code: paySession.currency_code,
      amount: paySession.amount,
      status: PaymentSessionStatus.AUTHORIZED,
      data: {
        ...((paySession.data as Record<string, unknown>) || {}),
        status: "success",
        merchant_oid: merchantOid,
        total_amount: totalAmount,
        payment_type: body.payment_type,
      },
    })

    // 4. Sepeti siparişe dönüştür (idempotent: zaten tamamlandıysa workflow hata
    // verebilir; OK dönüp PayTR'ı durdururuz).
    try {
      const { result } = await completeCartWorkflow(req.scope).run({
        input: { id: cartId },
      })
      logger.info(`PayTR Callback: sipariş oluşturuldu ${result.id} (oid: ${merchantOid})`)

      // merchant_oid'i siparişe yaz → payout'ta escrow serbest bırakma (platform
      // transfer) bu referansla yapılır.
      try {
        const orderModule = req.scope.resolve(Modules.ORDER)
        await orderModule.updateOrders([
          { id: result.id, metadata: { paytr_merchant_oid: merchantOid } },
        ])
      } catch (e: any) {
        logger.warn(`PayTR Callback: sipariş metadata yazılamadı: ${e?.message}`)
      }
    } catch (e: any) {
      logger.error(`PayTR Callback: sepet tamamlanamadı (${cartId}): ${e?.message}`)
      // Yine de OK döneriz; sipariş zaten tamamlanmış olabilir.
    }

    return res.status(200).send("OK")
  } catch (e: any) {
    logger.error(`PayTR Callback: işlenemedi (oid: ${merchantOid}): ${e?.message}`)
    return res.status(500).send("ERROR")
  }
}
