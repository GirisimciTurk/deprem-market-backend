import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260609101723 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "reseller_application" ("id" text not null, "company_name" text not null, "applicant_name" text not null default '', "email" text not null, "phone" text not null default '', "city" text not null default '', "tax_number" text not null default '', "message" text not null default '', "status" text check ("status" in ('pending', 'approved', 'rejected')) not null default 'pending', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "reseller_application_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reseller_application_email" ON "reseller_application" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reseller_application_deleted_at" ON "reseller_application" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "reseller_application" cascade;`);
  }

}
