import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    // Fetch all orders
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
        "items.*",
        "shipping_address.*",
        "fulfillments.*",
      ],
    });

    // Fetch all products
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "thumbnail",
        "variants.*",
        "variants.prices.*",
      ],
    });

    // Fetch all promotions/coupons
    let promotions: any[] = [];
    try {
      const promotionModuleService = req.scope.resolve(Modules.PROMOTION);
      promotions = await promotionModuleService.listPromotions({}, {
        relations: ["application_method"]
      });
    } catch (e: any) {
      console.error("Admin Dashboard promotions fetch error:", e);
    }

    return res.json({
      orders,
      products,
      promotions,
    });
  } catch (error: any) {
    console.error("Admin Dashboard GET error:", error);
    return res.status(500).json({ message: error.message || "Admin verileri alınamadı." });
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { action, payload } = req.body as { action: string; payload: any };

  if (!action) {
    return res.status(400).json({ message: "Action is required." });
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    if (action === "approve_order") {
      const { order_id } = payload;
      const orderModuleService = req.scope.resolve(Modules.ORDER);
      
      // Update order status to completed and payment_status to captured
      const updated = await (orderModuleService as any).updateOrders(order_id, {
        status: "completed",
        payment_status: "captured",
      });

      return res.json({ success: true, updated });
    }

    if (action === "ship_order") {
      const { order_id } = payload;
      const orderModuleService = req.scope.resolve(Modules.ORDER);

      // Create a simulated fulfillment and update order fulfillment status
      // In Medusa v2, we can set fulfillment_status directly on the order to "shipped"
      const updated = await (orderModuleService as any).updateOrders(order_id, {
        fulfillment_status: "shipped",
      });

      // We can also create a simulated fulfillment entry if needed, but updating status is sufficient for storefront tracking
      return res.json({ success: true, updated });
    }

    if (action === "cancel_order") {
      const { order_id } = payload;
      const orderModuleService = req.scope.resolve(Modules.ORDER);
      
      const updated = await (orderModuleService as any).updateOrders(order_id, {
        status: "canceled",
        payment_status: "canceled",
        fulfillment_status: "canceled",
      });

      return res.json({ success: true, updated });
    }

    if (action === "update_price") {
      const { price_id, amount } = payload;
      const pricingModuleService = req.scope.resolve(Modules.PRICING);

      // Update the price record
      const updated = await (pricingModuleService as any).updatePrices(
        { id: price_id },
        { amount: parseFloat(amount) }
      );

      return res.json({ success: true, updated });
    }

    if (action === "update_stock") {
      const { variant_id, inventory_quantity, manage_inventory } = payload;
      const productModuleService = req.scope.resolve(Modules.PRODUCT);
      
      // Update manage_inventory setting on variant
      const updatedVariant = await productModuleService.updateProductVariants(variant_id, {
        manage_inventory: !!manage_inventory,
      });

      // In Medusa v2, if manage_inventory is true, stock levels are linked through inventory module.
      // For a simplified demo/development setup, storing/updating inventory can be managed on the variant metadata
      // or using the inventory service if configured.
      // Let's store the custom inventory_quantity on variant metadata so it always displays and works perfectly!
      await productModuleService.updateProductVariants(variant_id, {
        metadata: {
          inventory_quantity: parseInt(inventory_quantity, 10),
        }
      });

      return res.json({ success: true, updatedVariant });
    }

    if (action === "create_promotion") {
      const { code, type, value, target_type } = payload;
      const promotionModuleService = req.scope.resolve(Modules.PROMOTION);

      const created = await promotionModuleService.createPromotions([
        {
          code: code.toUpperCase().trim(),
          type: "standard",
          is_automatic: false,
          status: "active" as any,
          application_method: {
            type, // "percentage" or "fixed"
            target_type, // "order" or "item" or "shipping"
            value: parseFloat(value),
            currency_code: "try",
          },
        },
      ]);

      return res.json({ success: true, created });
    }

    if (action === "delete_promotion") {
      const { promotion_id } = payload;
      const promotionModuleService = req.scope.resolve(Modules.PROMOTION);
      await promotionModuleService.deletePromotions([promotion_id]);
      return res.json({ success: true });
    }

    return res.status(400).json({ message: `Unknown action: ${action}` });
  } catch (error: any) {
    console.error(`Admin Dashboard POST error for ${action}:`, error);
    return res.status(500).json({ message: error.message || "İşlem sırasında bir hata oluştu." });
  }
}
