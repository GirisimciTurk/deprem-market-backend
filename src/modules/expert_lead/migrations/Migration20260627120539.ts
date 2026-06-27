import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260627120539 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "expert_lead" add column if not exists "membership_tier" text check ("membership_tier" in ('none', 'basic', 'premium')) not null default 'none';`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_lead_membership_tier" ON "expert_lead" ("membership_tier") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_expert_lead_membership_tier";`);
    this.addSql(`alter table if exists "expert_lead" drop column if exists "membership_tier";`);
  }

}
