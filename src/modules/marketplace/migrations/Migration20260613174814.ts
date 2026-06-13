import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613174814 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_return" drop constraint if exists "seller_return_status_check";`);

    this.addSql(`alter table if exists "seller_return" add column if not exists "reject_reason" text null, add column if not exists "rejected_at" timestamptz null;`);
    this.addSql(`alter table if exists "seller_return" add constraint "seller_return_status_check" check("status" in ('requested', 'received', 'rejected'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_return" drop constraint if exists "seller_return_status_check";`);

    this.addSql(`alter table if exists "seller_return" drop column if exists "reject_reason", drop column if exists "rejected_at";`);

    this.addSql(`alter table if exists "seller_return" add constraint "seller_return_status_check" check("status" in ('requested', 'received'));`);
  }

}
