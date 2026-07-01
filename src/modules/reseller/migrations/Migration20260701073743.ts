import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260701073743 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "reseller_application" add column if not exists "application_type" text check ("application_type" in ('bayi', 'firma')) not null default 'bayi';`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reseller_application_application_type" ON "reseller_application" ("application_type") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_reseller_application_application_type";`);
    this.addSql(`alter table if exists "reseller_application" drop column if exists "application_type";`);
  }

}
