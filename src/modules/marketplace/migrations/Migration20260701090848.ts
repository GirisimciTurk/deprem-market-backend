import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260701090848 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller" add column if not exists "partner_type" text check ("partner_type" in ('product', 'service')) not null default 'product';`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_partner_type" ON "seller" ("partner_type") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_seller_partner_type";`);
    this.addSql(`alter table if exists "seller" drop column if exists "partner_type";`);
  }

}
