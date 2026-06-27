import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260627125607 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "expert_lead" add column if not exists "verified_specializations" jsonb null, add column if not exists "service_regions" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "expert_lead" drop column if exists "verified_specializations", drop column if exists "service_regions";`);
  }

}
