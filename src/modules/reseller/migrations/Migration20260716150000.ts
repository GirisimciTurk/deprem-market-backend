import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260716150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "reseller_application" add column if not exists "seller_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "reseller_application" drop column if exists "seller_id";`);
  }

}
