import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619140617 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_analytics_event_created_at_type" ON "analytics_event" ("created_at", "type") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_analytics_event_created_at_type";`);
  }

}
