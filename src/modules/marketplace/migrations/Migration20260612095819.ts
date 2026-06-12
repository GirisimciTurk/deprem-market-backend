import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612095819 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "seller_order" ("id" text not null, "seller_id" text not null, "order_id" text not null, "display_id" text null, "customer_email" text null, "currency_code" text not null default 'try', "subtotal" integer not null default 0, "commission_rate" integer not null default 0, "commission_amount" integer not null default 0, "seller_earning" integer not null default 0, "item_count" integer not null default 0, "items" jsonb null, "shipping_address" jsonb null, "fulfillment_status" text check ("fulfillment_status" in ('pending', 'fulfilled', 'canceled')) not null default 'pending', "payout_status" text check ("payout_status" in ('pending', 'paid')) not null default 'pending', "paid_at" timestamptz null, "fulfilled_at" timestamptz null, "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_order_seller_id" ON "seller_order" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_order_order_id" ON "seller_order" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_order_fulfillment_status" ON "seller_order" ("fulfillment_status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_order_payout_status" ON "seller_order" ("payout_status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_order_deleted_at" ON "seller_order" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_order" add constraint "seller_order_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_order" cascade;`);
  }

}
