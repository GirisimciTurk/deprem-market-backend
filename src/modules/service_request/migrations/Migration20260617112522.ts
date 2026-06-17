import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260617112522 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "service_request" ("id" text not null, "product_id" text null, "service_title" text not null default '', "service_kind" text check ("service_kind" in ('carbon_fiber', 'panic_room', 'descent', 'capsule_bed', 'gas_cutoff', 'other')) not null default 'other', "requires_survey" boolean not null default true, "customer_id" text null, "full_name" text not null, "email" text not null, "phone" text not null default '', "city" text not null default '', "district" text not null default '', "address" text not null default '', "details" jsonb null, "preferred_dates" jsonb null, "assigned_seller_id" text null, "rejected_seller_ids" jsonb null, "survey_scheduled_at" timestamptz null, "survey_done_at" timestamptz null, "survey_report" text not null default '', "offer_items" jsonb null, "offer_total" integer null, "offer_valid_until" timestamptz null, "offer_sent_at" timestamptz null, "offer_decision" text check ("offer_decision" in ('pending', 'accepted', 'rejected')) not null default 'pending', "survey_fee" integer null, "deposit_amount" integer null, "balance_amount" integer null, "payment_status" text check ("payment_status" in ('none', 'survey_paid', 'deposit_paid', 'paid')) not null default 'none', "install_scheduled_at" timestamptz null, "install_done_at" timestamptz null, "status" text check ("status" in ('talep', 'kesif_planlandi', 'kesif_yapildi', 'teklif_gonderildi', 'onaylandi', 'reddedildi', 'tedarik', 'teslim_edildi', 'montaj_planlandi', 'montaj_yapildi', 'tamamlandi', 'iptal')) not null default 'talep', "note" text not null default '', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "service_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_product_id" ON "service_request" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_service_kind" ON "service_request" ("service_kind") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_customer_id" ON "service_request" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_email" ON "service_request" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_assigned_seller_id" ON "service_request" ("assigned_seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_payment_status" ON "service_request" ("payment_status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_status" ON "service_request" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_deleted_at" ON "service_request" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "service_request" cascade;`);
  }

}
