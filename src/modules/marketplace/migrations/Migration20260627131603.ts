import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260627131603 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller" add column if not exists "is_featured" boolean not null default false;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_is_featured" ON "seller" ("is_featured") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_seller_is_featured";`);
    this.addSql(`alter table if exists "seller" drop column if exists "is_featured";`);
  }

}
