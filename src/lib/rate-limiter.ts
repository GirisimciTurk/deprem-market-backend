import { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"

interface RateLimitRecord {
  count: number
  resetTime: number
}

export class InMemoryRateLimiter {
  private cache = new Map<string, RateLimitRecord>()

  constructor(
    private limit: number, // Max requests
    private windowMs: number // Window size in milliseconds
  ) {
    // Periodically clean up expired records to prevent memory leaks
    setInterval(() => {
      const now = Date.now()
      for (const [key, value] of this.cache.entries()) {
        if (now > value.resetTime) {
          this.cache.delete(key)
        }
      }
    }, 60000).unref() // Clean every 1 minute
  }

  /**
   * Check if an IP address has exceeded the rate limit.
   * Returns true if limited, false otherwise.
   */
  public isLimited(ip: string): boolean {
    const now = Date.now()
    const record = this.cache.get(ip)

    if (!record) {
      this.cache.set(ip, { count: 1, resetTime: now + this.windowMs })
      return false
    }

    if (now > record.resetTime) {
      // Reset window
      this.cache.set(ip, { count: 1, resetTime: now + this.windowMs })
      return false
    }

    record.count += 1
    return record.count > this.limit
  }

  public getRemainingSeconds(ip: string): number {
    const record = this.cache.get(ip)
    if (!record) return 0
    const remainingMs = record.resetTime - Date.now()
    return Math.max(0, Math.ceil(remainingMs / 1000))
  }
}

// Create instances for different routes
// Installments: max 15 requests per 1 minute
export const installmentsLimiter = new InMemoryRateLimiter(15, 60000)

// Paynkolay Callback: max 20 requests per 1 minute
export const callbackLimiter = new InMemoryRateLimiter(20, 60000)

// Order tracking: max 10 requests per 1 minute (guards against enumeration of
// sequential order numbers + guessed emails)
export const orderTrackingLimiter = new InMemoryRateLimiter(10, 60000)

// Paynkolay hash signing: max 30 requests per 1 minute
export const hashLimiter = new InMemoryRateLimiter(30, 60000)

// Paynkolay saved-cards list/delete: max 20 requests per 1 minute
export const cardsLimiter = new InMemoryRateLimiter(20, 60000)

/**
 * Shared helper: enforce a rate limit for the request's client IP. Returns true
 * and writes a 429 response when the caller is limited; the route should then
 * return immediately.
 */
export function enforceRateLimit(
  limiter: InMemoryRateLimiter,
  req: MedusaRequest,
  res: MedusaResponse
): boolean {
  const rawIp =
    (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown_ip"
  const clientIp = rawIp.split(",")[0].trim()
  if (limiter.isLimited(clientIp)) {
    res.status(429).json({
      success: false,
      message: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
      retryAfterSeconds: limiter.getRemainingSeconds(clientIp),
    })
    return true
  }
  return false
}
