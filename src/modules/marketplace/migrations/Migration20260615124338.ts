import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260615124338 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller" add column if not exists "free_shipping_threshold" integer null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller" drop column if exists "free_shipping_threshold";`);
  }

}
