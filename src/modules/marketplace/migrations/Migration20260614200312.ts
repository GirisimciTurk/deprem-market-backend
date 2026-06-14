import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260614200312 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_contract_acceptance" add column if not exists "user_agent" text null, add column if not exists "content_hash" text null, add column if not exists "identity_snapshot" jsonb null;`);

    this.addSql(`alter table if exists "seller_order" add column if not exists "platform_cargo_fee" integer not null default 0, add column if not exists "payout_trans_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_contract_acceptance" drop column if exists "user_agent", drop column if exists "content_hash", drop column if exists "identity_snapshot";`);

    this.addSql(`alter table if exists "seller_order" drop column if exists "platform_cargo_fee", drop column if exists "payout_trans_id";`);
  }

}
