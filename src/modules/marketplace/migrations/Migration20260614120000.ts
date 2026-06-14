import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260614120000 extends Migration {

  override async up(): Promise<void> {
    // Hibrit kargo: anlaşmalı (Yurtiçi) kargo ücretini fulfill anında geri
    // yükleyebilmek için desi-bazlı platform ücretini ayrı sakla.
    this.addSql(`alter table if exists "seller_order" add column if not exists "platform_cargo_fee" integer not null default 0;`);
    // PayTR Pazaryeri transfer (escrow serbest bırakma) referansı.
    this.addSql(`alter table if exists "seller_order" add column if not exists "payout_trans_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_order" drop column if exists "platform_cargo_fee";`);
    this.addSql(`alter table if exists "seller_order" drop column if exists "payout_trans_id";`);
  }

}
