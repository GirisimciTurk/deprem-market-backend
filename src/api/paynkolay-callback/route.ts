import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, PaymentSessionStatus } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { createHash } from "crypto"
import { callbackLimiter } from "../../lib/rate-limiter"

function calculateResponseHash(
  merchantNo: string,
  referenceCode: string,
  authCode: string,
  responseCode: string,
  use3D: string,
  rnd: string,
  installment: string,
  authAmount: string,
  currencyCode: string,
  merchantSecretKey: string
): string {
  const raw = `${merchantNo}|${referenceCode}|${authCode}|${responseCode}|${use3D}|${rnd}|${installment}|${authAmount}|${currencyCode}|${merchantSecretKey}`
  return createHash("sha512").update(raw, "utf-8").digest("base64")
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const logger = req.scope.resolve("logger")
  
  // Rate limiting check
  const rawIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown_ip"
  const clientIp = rawIp.split(",")[0].trim()

  if (callbackLimiter.isLimited(clientIp)) {
    logger.warn(`Paynkolay Callback: Rate limit exceeded for IP: ${clientIp}`)
    const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:8000"
    return res.redirect(`${storefrontUrl}/tr/checkout?step=payment&error=Too%20many%20requests.%20Please%20try%20again%20later.`)
  }

  const body = (req.body as any) || {}
  
  const merchantNo = (body.MERCHANT_NO as string) || ""
  const referenceCode = (body.REFERENCE_CODE as string) || ""
  const authCode = (body.AUTH_CODE as string) || ""
  const responseCode = (body.RESPONSE_CODE as string) || ""
  const use3D = (body.USE_3D as string) || ""
  const rnd = (body.RND as string) || ""
  const installment = (body.INSTALLMENT as string) || ""
  const authAmount = (body.AUTHORIZATION_AMOUNT as string) || ""
  const currencyCode = (body.CURRENCY_CODE as string) || ""
  const receivedHash = (body.hashDataV2 as string) || (body.hashDatav2 as string) || (body.HASH_DATAV2 as string) || (body.HASH as string) || ""
  const responseData = (body.RESPONSE_DATA as string) || ""
  const ErrorMessage = (body.ErrorMessage as string) || ""
  const sessionId = (body.CLIENT_REFERENCE_CODE as string) || ""

  logger.info(`Paynkolay Callback: POST request received from IP ${clientIp} for session ID/Reference Code: ${sessionId}`)
  logger.info(`Paynkolay Callback: Received body keys: ${Object.keys(body).join(", ")}`)
  logger.debug(`Paynkolay Callback: Received payload: ${JSON.stringify(body)}`)

  const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:8000"
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Retrieve the payment session
  logger.debug(`Paynkolay Callback: Retrieving payment session for ID: ${sessionId}`)
  const { data: paySessions } = await query.graph({
    entity: "payment_session",
    fields: [
      "id",
      "currency_code",
      "amount",
      "data",
      "payment_collection_id"
    ],
    filters: {
      id: sessionId
    }
  })

  if (!paySessions || paySessions.length === 0) {
    logger.warn(`Paynkolay Callback: Payment session with ID ${sessionId} was not found in DB`)
    return res.redirect(`${storefrontUrl}/tr/checkout?step=payment&error=Payment%20session%20not%20found`)
  }

  const paySession = paySessions[0]
  const paymentCollectionId = paySession.payment_collection_id
  logger.debug(`Paynkolay Callback: Payment session retrieved. Payment Collection ID: ${paymentCollectionId}`)

  // 2. Retrieve the cart linked to the payment collection via the link relation
  const { data: cartCollectionRelations } = await query.graph({
    entity: "cart_payment_collection",
    fields: ["cart_id", "payment_collection_id"],
    filters: {
      payment_collection_id: paymentCollectionId
    }
  })

  if (!cartCollectionRelations || cartCollectionRelations.length === 0) {
    logger.warn(`Paynkolay Callback: Cart relation not found for payment collection: ${paymentCollectionId}`)
    return res.redirect(`${storefrontUrl}/tr/checkout?step=payment&error=Cart%20not%20found`)
  }

  const cartId = cartCollectionRelations[0].cart_id
  logger.debug(`Paynkolay Callback: Cart ID resolved: ${cartId}`)

  // 3. Retrieve cart details
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "shipping_address.country_code"
    ],
    filters: {
      id: cartId
    }
  })

  if (!carts || carts.length === 0) {
    logger.warn(`Paynkolay Callback: Cart details not found for ID: ${cartId}`)
    return res.redirect(`${storefrontUrl}/tr/checkout?step=payment&error=Cart%20not%20found`)
  }

  const cart = carts[0]
  const countryCode = cart.shipping_address?.country_code?.toLowerCase() || "tr"

  // 4. Verify payment success code first
  if (responseCode !== "2" || !authCode) {
    logger.error(`Paynkolay Callback: Payment transaction rejected by bank or canceled. Response Code: ${responseCode}, Response Data: ${responseData || ErrorMessage || "No data"}`)
    const displayError = responseData || ErrorMessage || "Ödeme başarısız oldu veya iptal edildi."
    return res.redirect(
      `${storefrontUrl}/${countryCode}/checkout?step=payment&error=${encodeURIComponent(displayError)}`
    )
  }

  // 5. Verify response signature (hashDataV2) for successful transactions
  const secretKey = process.env.PAYNKOLAY_SECRET_KEY || "_YckdxUbv4vrnMUZ6VQsr"
  const calculatedHash = calculateResponseHash(
    merchantNo,
    referenceCode,
    authCode,
    responseCode,
    use3D,
    rnd,
    installment,
    authAmount,
    currencyCode,
    secretKey
  )

  if (calculatedHash !== receivedHash) {
    logger.error(`Paynkolay Callback: Hash signature verification failed for session ${sessionId}. Calculated: ${calculatedHash}, Received: ${receivedHash}`)
    return res.redirect(`${storefrontUrl}/${countryCode}/checkout?step=payment&error=Invalid%20payment%20signature`)
  }
  logger.info(`Paynkolay Callback: Hash signature verified successfully for session ${sessionId}`)

  logger.info(`Paynkolay Callback: Payment authorized by bank. Reference Code: ${referenceCode}, Auth Code: ${authCode}`)

  // 6. Update the payment session to authorized status
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT)
  await paymentModuleService.updatePaymentSession({
    id: paySession.id,
    currency_code: paySession.currency_code,
    amount: paySession.amount,
    status: PaymentSessionStatus.AUTHORIZED,
    data: {
      ...((paySession.data as Record<string, unknown>) || {}),
      status: "success",
      auth_code: authCode,
      reference_code: referenceCode,
      merchant_no: merchantNo,
      response_data: responseData,
      installment,
      received_amount: authAmount
    }
  })
  logger.info(`Paynkolay Callback: Payment session status updated to AUTHORIZED in payment database`)

  // 7. Complete the cart to place the order
  try {
    logger.info(`Paynkolay Callback: Starting cart completion workflow for cart ID: ${cart.id}`)
    const { result } = await completeCartWorkflow(req.scope).run({
      input: {
        id: cart.id
      }
    })

    logger.info(`Paynkolay Callback: Cart successfully completed. Order placed: ${result.id}. Redirecting customer.`)
    return res.redirect(`${storefrontUrl}/${countryCode}/order/${result.id}/confirmed`)
  } catch (error: any) {
    logger.error(`Paynkolay Callback: Cart completion workflow failed for cart ID ${cart.id}. Error: ${error.message || error}`, error)
    return res.redirect(
      `${storefrontUrl}/${countryCode}/checkout?step=payment&error=${encodeURIComponent(
        error.message || "Order completion failed."
      )}`
    )
  }
}
