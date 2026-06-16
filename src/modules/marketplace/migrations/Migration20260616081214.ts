import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260616081214 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "brand" drop constraint if exists "brand_slug_unique";`);
    this.addSql(`create table if not exists "brand" ("id" text not null, "name" text not null, "slug" text not null, "status" text check ("status" in ('approved', 'pending')) not null default 'pending', "logo" text null, "requested_by_seller_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "brand_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_brand_slug_unique" ON "brand" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_brand_deleted_at" ON "brand" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "category_attribute" ("id" text not null, "category_id" text not null, "key" text not null, "name" text not null, "type" text check ("type" in ('text', 'number', 'select', 'multiselect', 'boolean')) not null default 'text', "options" jsonb null, "unit" text null, "required" boolean not null default false, "rank" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "category_attribute_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_attribute_category_id" ON "category_attribute" ("category_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_attribute_deleted_at" ON "category_attribute" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "brand" cascade;`);

    this.addSql(`drop table if exists "category_attribute" cascade;`);
  }

}
