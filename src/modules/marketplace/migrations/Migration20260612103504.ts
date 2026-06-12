import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612103504 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "seller_return" ("id" text not null, "seller_id" text not null, "return_id" text not null, "order_id" text not null, "seller_order_id" text null, "display_id" text null, "customer_email" text null, "currency_code" text not null default 'try', "status" text check ("status" in ('requested', 'received')) not null default 'requested', "reason" text null, "items" jsonb null, "returned_subtotal" integer not null default 0, "returned_commission" integer not null default 0, "returned_earning" integer not null default 0, "received_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_return_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_return_seller_id" ON "seller_return" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_return_return_id" ON "seller_return" ("return_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_return_order_id" ON "seller_return" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_return_status" ON "seller_return" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_return_deleted_at" ON "seller_return" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_return" add constraint "seller_return_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "seller_order" add column if not exists "returned_subtotal" integer not null default 0, add column if not exists "returned_commission" integer not null default 0, add column if not exists "returned_earning" integer not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_return" cascade;`);

    this.addSql(`alter table if exists "seller_order" drop column if exists "returned_subtotal", drop column if exists "returned_commission", drop column if exists "returned_earning";`);
  }

}
