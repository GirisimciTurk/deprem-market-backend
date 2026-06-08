import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { display_id, email } = req.query as { display_id?: string; email?: string };

  if (!display_id || !email) {
    return res.status(400).json({ message: "Sipariş numarası ve e-posta adresi gereklidir." });
  }

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
      ],
      filters: {
        display_id: display_id,
        email: email.trim().toLowerCase(),
      },
    });

    if (!orders || orders.length === 0) {
      return res.status(404).json({ message: "Sipariş bulunamadı. Lütfen sipariş numarasını ve e-posta adresini kontrol edip tekrar deneyin." });
    }

    const order = orders[0];

    return res.json({
      order
    });
  } catch (error: any) {
    console.error("Order tracking error:", error);
    return res.status(500).json({ message: error.message || "Sipariş sorgulanırken bir hata oluştu." });
  }
}
