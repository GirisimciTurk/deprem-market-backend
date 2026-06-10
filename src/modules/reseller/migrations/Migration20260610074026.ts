import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610074026 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reseller_application_status" ON "reseller_application" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_reseller_application_status";`);
  }

}
