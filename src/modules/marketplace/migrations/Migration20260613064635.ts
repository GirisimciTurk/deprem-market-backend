import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613064635 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "seller_review" ("id" text not null, "seller_id" text not null, "order_id" text null, "customer_id" text null, "customer_name" text not null, "rating" integer not null, "comment" text not null, "status" text check ("status" in ('pending', 'approved', 'spam')) not null default 'pending', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_review_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_review_seller_id" ON "seller_review" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_review_order_id" ON "seller_review" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_review_customer_id" ON "seller_review" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_review_status" ON "seller_review" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_review_deleted_at" ON "seller_review" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_review" add constraint "seller_review_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "seller" add column if not exists "default_carrier" text null, add column if not exists "rating_sum" integer not null default 0, add column if not exists "rating_count" integer not null default 0;`);

    this.addSql(`alter table if exists "seller_order" add column if not exists "carrier" text null, add column if not exists "tracking_number" text null, add column if not exists "tracking_url" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_review" cascade;`);

    this.addSql(`alter table if exists "seller" drop column if exists "default_carrier", drop column if exists "rating_sum", drop column if exists "rating_count";`);

    this.addSql(`alter table if exists "seller_order" drop column if exists "carrier", drop column if exists "tracking_number", drop column if exists "tracking_url";`);
  }

}
