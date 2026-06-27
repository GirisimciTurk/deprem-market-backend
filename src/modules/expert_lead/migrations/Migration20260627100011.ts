import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260627100011 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "expert_lead" add column if not exists "provider_type" text check ("provider_type" in ('engineer', 'implementer')) not null default 'engineer';`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_lead_provider_type" ON "expert_lead" ("provider_type") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_expert_lead_provider_type";`);
    this.addSql(`alter table if exists "expert_lead" drop column if exists "provider_type";`);
  }

}
