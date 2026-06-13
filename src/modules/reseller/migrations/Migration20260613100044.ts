import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613100044 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "reseller_application" drop constraint if exists "reseller_application_status_check";`);

    this.addSql(`alter table if exists "reseller_application" add constraint "reseller_application_status_check" check("status" in ('pending', 'approved', 'rejected', 'suspended'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "reseller_application" drop constraint if exists "reseller_application_status_check";`);

    this.addSql(`alter table if exists "reseller_application" add constraint "reseller_application_status_check" check("status" in ('pending', 'approved', 'rejected'));`);
  }

}
