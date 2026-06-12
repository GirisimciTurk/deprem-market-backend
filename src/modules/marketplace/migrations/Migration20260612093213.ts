import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612093213 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_admin" drop constraint if exists "seller_admin_email_unique";`);
    this.addSql(`alter table if exists "seller" drop constraint if exists "seller_handle_unique";`);
    this.addSql(`create table if not exists "seller" ("id" text not null, "handle" text not null, "name" text not null, "legal_name" text null, "email" text null, "phone" text null, "logo" text null, "description" text null, "status" text check ("status" in ('pending', 'active', 'suspended')) not null default 'pending', "commission_rate" integer not null default 10, "tax_number" text null, "iban" text null, "account_holder" text null, "is_house" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_handle_unique" ON "seller" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_status" ON "seller" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_deleted_at" ON "seller" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "seller_admin" ("id" text not null, "first_name" text null, "last_name" text null, "email" text not null, "phone" text null, "seller_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_admin_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_admin_email_unique" ON "seller_admin" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_admin_seller_id" ON "seller_admin" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_admin_deleted_at" ON "seller_admin" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_admin" add constraint "seller_admin_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_admin" drop constraint if exists "seller_admin_seller_id_foreign";`);

    this.addSql(`drop table if exists "seller" cascade;`);

    this.addSql(`drop table if exists "seller_admin" cascade;`);
  }

}
