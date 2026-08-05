import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "zod";
import { orderTrackingLimiter, enforceRateLimit } from "../../../lib/rate-limiter";
import { buildSellerShipments, shipmentsStage } from "../../../lib/seller-shipments";
import { stageLabel } from "../../../lib/order-stage";
import { errorMessage } from "../../../lib/errors"

const querySchema = z.object({
  display_id: z.string().regex(/^\d+$/, "display_id must be a positive integer"),
  email: z.string().trim().toLowerCase().email(),
});

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Rate limit to prevent enumeration of sequential order numbers + guessed emails.
  if (await enforceRateLimit(orderTrackingLimiter, req, res)) return;

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

    // KÖK NEDEN DÜZELTMESİ: 4 aşamalı çizelge eskiden yalnız ÇEKİRDEK
    // order.fulfillment_status'u okuyordu. Bu kod tabanında çekirdek fulfillment
    // hiç yaratılmadığı için o alan kalıcı olarak "not_fulfilled" kalıyor ve müşteri
    // satıcı ne yaparsa yapsın hep "Hazırlanıyor" görüyordu. Gerçek aşama
    // satıcı alt-siparişlerinde (seller_order) duruyor → yanıta ekliyoruz.
    //
    // Satıcı adı ve takip numarası burada gösteriliyor: misafir sipariş no +
    // e-posta ile doğrulandı ve bu bilgiler kargo e-postasında zaten kendisine
    // gitti; yeni bir bilgi sızıntısı değil.
    const order = orders[0] as Record<string, unknown>;
    let seller_shipments: Awaited<ReturnType<typeof buildSellerShipments>> = [];
    try {
      seller_shipments = await buildSellerShipments(req.scope, order.id as string);
    } catch (e) {
      // Aşama kırılımı alınamazsa takip ekranı yine çalışsın (eski davranışa düşer).
      req.scope
        .resolve("logger")
        .error(`Order tracking seller shipments error: ${errorMessage(e)}`);
    }

    const stage = shipmentsStage(seller_shipments);

    return res.json({
      order: {
        ...order,
        seller_shipments,
        // Sipariş seviyesinde tek aşama = en geride olan paket (müşteri gelmeyen
        // paketi yolda sanmasın). null ise alt-sipariş yok → storefront eski
        // çekirdek-durum mantığına düşer.
        stage,
        stage_label: stage ? stageLabel(stage) : null,
      },
    });
  } catch (error) {
    const logger = req.scope.resolve("logger");
    logger.error(`Order tracking error: ${errorMessage(error)}`);
    return res
      .status(500)
      .json({ message: "Sipariş sorgulanırken bir hata oluştu." });
  }
}
