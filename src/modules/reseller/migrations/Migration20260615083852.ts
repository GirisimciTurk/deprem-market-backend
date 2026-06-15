import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260615083852 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "reseller_application" add column if not exists "rejected_at" timestamptz null;`);
    // Geriye dönük: hâlihazırda "rejected" olan başvuruları son güncelleme
    // zamanından damgala ki 24 saatlik temizlik onları da kapsasın.
    this.addSql(`update "reseller_application" set "rejected_at" = "updated_at" where "status" = 'rejected' and "rejected_at" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "reseller_application" drop column if exists "rejected_at";`);
  }

}
