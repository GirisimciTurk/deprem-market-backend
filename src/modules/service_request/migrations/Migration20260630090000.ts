import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260630090000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "service_request" add column if not exists "assessment_mode" text check ("assessment_mode" in ('pending', 'media', 'survey')) not null default 'pending', add column if not exists "media" jsonb null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_assessment_mode" ON "service_request" ("assessment_mode") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_service_request_assessment_mode";`);
    this.addSql(`alter table if exists "service_request" drop column if exists "assessment_mode", drop column if exists "media";`);
  }

}
