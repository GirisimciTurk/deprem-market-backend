import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618132505 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_review" add column if not exists "ai_action" text null, add column if not exists "ai_verdict" text null, add column if not exists "ai_confidence" integer null, add column if not exists "ai_reason" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_review" drop column if exists "ai_action", drop column if exists "ai_verdict", drop column if exists "ai_confidence", drop column if exists "ai_reason";`);
  }

}
