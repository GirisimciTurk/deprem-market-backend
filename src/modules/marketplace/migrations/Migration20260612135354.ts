import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612135354 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "commission_rule" drop constraint if exists "commission_rule_category_id_unique";`);
    this.addSql(`create table if not exists "commission_rule" ("id" text not null, "category_id" text not null, "category_name" text null, "rate" integer not null default 10, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commission_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_commission_rule_category_id_unique" ON "commission_rule" ("category_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commission_rule_deleted_at" ON "commission_rule" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commission_rule" cascade;`);
  }

}
