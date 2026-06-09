import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "zod";
import { orderTrackingLimiter, enforceRateLimit } from "../../../lib/rate-limiter";

const querySchema = z.object({
  display_id: z.string().regex(/^\d+$/, "display_id must be a positive integer"),
  email: z.string().trim().toLowerCase().email(),
});

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Rate limit to prevent enumeration of sequential order numbers + guessed emails.
  if (enforceRateLimit(orderTrackingLimiter, req, res)) return;

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Geçerli bir sipariş numarası ve e-posta adresi giriniz.",
    });
  }
  const { display_id, email } = parsed.data;

  try {
    const query = req.scope.resolve("query");

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "status",
        "fulfillment_status",
        "payment_status",
        "created_at",
        "currency_code",
        "shipping_methods.*",
        "items.*",
        "shipping_address.*",
        "fulfillments.*",
        "fulfillments.labels.tracking_number",
        "fulfillments.labels.tracking_url",
        "fulfillments.labels.label_url",
      ],
      filters: {
        display_id,
        email,
      },
    });

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        message:
          "Sipariş bulunamadı. Lütfen sipariş numarasını ve e-posta adresini kontrol edip tekrar deneyin.",
      });
    }

    return res.json({ order: orders[0] });
  } catch (error: any) {
    const logger = req.scope.resolve("logger");
    logger.error(`Order tracking error: ${error?.message}`);
    return res
      .status(500)
      .json({ message: "Sipariş sorgulanırken bir hata oluştu." });
  }
}
