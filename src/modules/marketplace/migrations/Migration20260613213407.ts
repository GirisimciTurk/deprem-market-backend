import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613213407 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "seller_campaign" ("id" text not null, "seller_id" text not null, "price_list_id" text not null, "name" text not null, "discount_type" text check ("discount_type" in ('percentage', 'fixed')) not null default 'percentage', "discount_value" integer not null default 0, "status" text check ("status" in ('active', 'ended')) not null default 'active', "starts_at" timestamptz null, "ends_at" timestamptz null, "product_ids" jsonb null, "variant_count" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_campaign_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_campaign_seller_id" ON "seller_campaign" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_campaign_price_list_id" ON "seller_campaign" ("price_list_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_campaign_status" ON "seller_campaign" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_campaign_deleted_at" ON "seller_campaign" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_campaign" add constraint "seller_campaign_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_campaign" cascade;`);
  }

}
