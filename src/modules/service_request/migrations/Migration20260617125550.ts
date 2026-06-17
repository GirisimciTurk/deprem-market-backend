import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260617125550 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "service_request" add column if not exists "paid_total" integer null, add column if not exists "payments" jsonb null, add column if not exists "commission_rate" integer null, add column if not exists "commission_amount" integer null, add column if not exists "payout_amount" integer null, add column if not exists "payout_status" text check ("payout_status" in ('pending', 'eligible', 'paid')) not null default 'pending', add column if not exists "payout_trans_id" text null, add column if not exists "paid_at" timestamptz null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_payout_status" ON "service_request" ("payout_status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_service_request_payout_status";`);
    this.addSql(`alter table if exists "service_request" drop column if exists "paid_total", drop column if exists "payments", drop column if exists "commission_rate", drop column if exists "commission_amount", drop column if exists "payout_amount", drop column if exists "payout_status", drop column if exists "payout_trans_id", drop column if exists "paid_at";`);
  }

}
