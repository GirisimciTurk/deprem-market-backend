import { Migration } from "@mikro-orm/migrations"

/**
 * seller_order'da (order_id, seller_id) ÇİFTİNE partial unique index ekler.
 * Amaç: order.placed olayı at-least-once teslimatla iki kez gelirse siparişin
 * iki kez bölünmesini (çift komisyon/fatura) DB seviyesinde engellemek.
 * Bir sipariş × satıcı en fazla bir seller_order üretebilir.
 */
export class Migration20260614010000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_seller_order_order_seller" ON "seller_order" ("order_id", "seller_id") WHERE deleted_at IS NULL;`
    )
  }

  async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "UQ_seller_order_order_seller";`)
  }
}
