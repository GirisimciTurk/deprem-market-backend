import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613231034 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "cargo_tariff" ("id" text not null, "tiers" jsonb not null, "per_extra_fee" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cargo_tariff_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cargo_tariff_deleted_at" ON "cargo_tariff" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_order" add column if not exists "cargo_fee" integer not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cargo_tariff" cascade;`);

    this.addSql(`alter table if exists "seller_order" drop column if exists "cargo_fee";`);
  }

}
