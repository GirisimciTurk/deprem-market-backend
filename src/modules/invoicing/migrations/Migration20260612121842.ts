import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612121842 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "invoice" ("id" text not null, "type" text check ("type" in ('sale', 'commission')) not null, "status" text check ("status" in ('draft', 'sent', 'error')) not null default 'draft', "draft_number" text not null, "invoice_number" text null, "issue_date" timestamptz not null, "issuer_name" text not null, "issuer_tax_number" text null, "recipient_name" text not null, "recipient_tax_number" text null, "recipient_email" text null, "recipient_address" jsonb null, "order_id" text not null, "display_id" text null, "seller_order_id" text null, "seller_id" text null, "currency_code" text not null default 'try', "net_total" integer not null default 0, "tax_total" integer not null default 0, "grand_total" integer not null default 0, "tax_rate" integer not null default 20, "lines" jsonb null, "ubl_payload" jsonb null, "provider" text null, "external_id" text null, "sent_at" timestamptz null, "error_message" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "invoice_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_type" ON "invoice" ("type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_status" ON "invoice" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_order_id" ON "invoice" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_seller_id" ON "invoice" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_deleted_at" ON "invoice" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "invoice" cascade;`);
  }

}
