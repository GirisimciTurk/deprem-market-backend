import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612133622 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_order" drop constraint if exists "seller_order_payout_status_check";`);

    this.addSql(`alter table if exists "seller_order" add column if not exists "eligible_at" timestamptz null;`);
    this.addSql(`alter table if exists "seller_order" add constraint "seller_order_payout_status_check" check("payout_status" in ('pending', 'eligible', 'paid'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_order" drop constraint if exists "seller_order_payout_status_check";`);

    this.addSql(`alter table if exists "seller_order" drop column if exists "eligible_at";`);

    this.addSql(`alter table if exists "seller_order" add constraint "seller_order_payout_status_check" check("payout_status" in ('pending', 'paid'));`);
  }

}
