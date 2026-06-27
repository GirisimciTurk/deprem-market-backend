import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260627090452 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "expert_lead" ("id" text not null, "full_name" text not null, "title" text not null default '', "email" text not null, "phone" text not null default '', "city" text not null default '', "district" text not null default '', "specializations" jsonb not null, "experience_years" integer null, "imo_member" boolean not null default false, "service_areas" text not null default '', "budget_tier" text not null default '', "message" text not null default '', "status" text check ("status" in ('new', 'contacted', 'approved', 'archived')) not null default 'new', "notes" text not null default '', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "expert_lead_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_lead_email" ON "expert_lead" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_lead_status" ON "expert_lead" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_lead_deleted_at" ON "expert_lead" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "expert_lead" cascade;`);
  }

}
