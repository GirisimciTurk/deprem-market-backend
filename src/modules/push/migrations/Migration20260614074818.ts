import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260614074818 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "push_subscription" drop constraint if exists "push_subscription_endpoint_unique";`);
    this.addSql(`create table if not exists "push_subscription" ("id" text not null, "endpoint" text not null, "p256dh" text not null, "auth" text not null, "customer_id" text null, "user_agent" text null, "locale" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "push_subscription_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_push_subscription_endpoint_unique" ON "push_subscription" ("endpoint") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_push_subscription_customer_id" ON "push_subscription" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_push_subscription_deleted_at" ON "push_subscription" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "stock_alert" ("id" text not null, "variant_id" text not null, "product_id" text null, "product_handle" text null, "product_title" text null, "endpoint" text not null, "customer_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_alert_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_alert_variant_id" ON "stock_alert" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_alert_product_id" ON "stock_alert" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_alert_endpoint" ON "stock_alert" ("endpoint") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_alert_deleted_at" ON "stock_alert" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "push_subscription" cascade;`);

    this.addSql(`drop table if exists "stock_alert" cascade;`);
  }

}
