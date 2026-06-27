import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260627113650 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "expert_lead" add column if not exists "slug" text null, add column if not exists "about" text not null default '', add column if not exists "photo_url" text not null default '', add column if not exists "documents" jsonb null, add column if not exists "whatsapp" text not null default '', add column if not exists "show_phone" boolean not null default true, add column if not exists "show_email" boolean not null default false, add column if not exists "is_published" boolean not null default false, add column if not exists "published_at" timestamptz null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_lead_is_published" ON "expert_lead" ("is_published") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_expert_lead_is_published";`);
    this.addSql(`alter table if exists "expert_lead" drop column if exists "slug", drop column if exists "about", drop column if exists "photo_url", drop column if exists "documents", drop column if exists "whatsapp", drop column if exists "show_phone", drop column if exists "show_email", drop column if exists "is_published", drop column if exists "published_at";`);
  }

}
