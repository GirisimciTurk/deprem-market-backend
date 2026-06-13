import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613104027 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_review" add column if not exists "customer_email" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_review" drop column if exists "customer_email";`);
  }

}
