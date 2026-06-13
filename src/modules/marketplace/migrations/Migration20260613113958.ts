import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613113958 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "seller_contract" ("id" text not null, "title" text not null, "version" integer not null default 1, "body" text null, "pdf_url" text null, "is_active" boolean not null default true, "required" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_contract_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_contract_is_active" ON "seller_contract" ("is_active") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_contract_deleted_at" ON "seller_contract" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "seller_contract_acceptance" ("id" text not null, "seller_id" text not null, "contract_id" text not null, "version" integer not null, "full_name" text null, "ip" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_contract_acceptance_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_contract_acceptance_seller_id" ON "seller_contract_acceptance" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_contract_acceptance_contract_id" ON "seller_contract_acceptance" ("contract_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_contract_acceptance_deleted_at" ON "seller_contract_acceptance" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_contract" cascade;`);

    this.addSql(`drop table if exists "seller_contract_acceptance" cascade;`);
  }

}
