import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612081612 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "blog_post" add column if not exists "translations" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "blog_post" drop column if exists "translations";`);
  }

}
