import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619113838 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "analytics_event" ("id" text not null, "type" text check ("type" in ('product_view', 'search', 'add_to_cart', 'remove_from_cart', 'checkout_start', 'purchase')) not null, "customer_id" text null, "session_id" text null, "product_id" text null, "variant_id" text null, "search_query" text null, "results_count" integer null, "value" integer null, "quantity" integer null, "currency_code" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "analytics_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_type" ON "analytics_event" ("type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_customer_id" ON "analytics_event" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_session_id" ON "analytics_event" ("session_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_product_id" ON "analytics_event" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_deleted_at" ON "analytics_event" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "analytics_event" cascade;`);
  }

}
