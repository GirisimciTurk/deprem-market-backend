import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610074024 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_post_status" ON "blog_post" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_blog_post_status";`);
  }

}
