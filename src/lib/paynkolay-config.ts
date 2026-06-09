/**
 * Centralized Paynkolay configuration.
 *
 * Credentials and endpoints are read from environment variables. In production
 * the required secrets MUST be provided — we fail closed (throw) rather than
 * silently falling back to Paynkolay's public TEST merchant, which would route
 * real payments to the test environment. In non-production we fall back to the
 * published test credentials so local development keeps working without setup.
 */

// Paynkolay's public TEST merchant credentials (safe to ship; test env only).
const TEST_SX =
  "118591467|bScbGDYCtPf7SS1N6PQ6/+58rFhW1WpsWINqvkJFaJlu6bMH2tgPKDQtjeA5vClpzJP24uA0vx7OX53cP3SgUspa4EvYix+1C3aXe++8glUvu9Oyyj3v300p5NP7ro/9K57Zcw=="
const TEST_SECRET_KEY = "_YckdxUbv4vrnMUZ6VQsr"
const TEST_AGENT_CODE = "1236"

const TEST_BASE_URL = "https://paynkolaytest.nkolayislem.com.tr/Vpos"
const PROD_BASE_URL = "https://paynkolay.nkolayislem.com.tr/Vpos"

export interface PaynkolayConfig {
  sx: string
  cancelSx: string
  secretKey: string
  agentCode: string
  successUrl: string
  failUrl: string
  /** Base VPOS URL, e.g. https://.../Vpos (no trailing slash). */
  baseUrl: string
  isProduction: boolean
}

export function getPaynkolayConfig(): PaynkolayConfig {
  const isProduction = process.env.NODE_ENV === "production"

  const sx = process.env.PAYNKOLAY_SX || (isProduction ? "" : TEST_SX)
  const secretKey =
    process.env.PAYNKOLAY_SECRET_KEY || (isProduction ? "" : TEST_SECRET_KEY)
  const agentCode =
    process.env.PAYNKOLAY_AGENT_CODE || (isProduction ? "" : TEST_AGENT_CODE)

  if (isProduction && (!sx || !secretKey || !agentCode)) {
    throw new Error(
      "Paynkolay yapılandırması eksik: PAYNKOLAY_SX, PAYNKOLAY_SECRET_KEY ve " +
        "PAYNKOLAY_AGENT_CODE ortam değişkenleri production ortamında zorunludur."
    )
  }

  const cancelSx = process.env.PAYNKOLAY_CANCEL_SX || sx
  const baseUrl = isProduction ? PROD_BASE_URL : TEST_BASE_URL

  const defaultCallback = `${
    process.env.BACKEND_URL || "http://localhost:9000"
  }/paynkolay-callback`
  const successUrl = process.env.PAYNKOLAY_SUCCESS_URL || defaultCallback
  const failUrl = process.env.PAYNKOLAY_FAIL_URL || defaultCallback

  return {
    sx,
    cancelSx,
    secretKey,
    agentCode,
    successUrl,
    failUrl,
    baseUrl,
    isProduction,
  }
}
