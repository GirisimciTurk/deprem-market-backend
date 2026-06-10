import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610074025 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_status" ON "product_review" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_product_review_status";`);
  }

}
