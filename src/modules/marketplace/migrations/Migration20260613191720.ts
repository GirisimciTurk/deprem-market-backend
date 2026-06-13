import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613191720 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "notification_item" ("id" text not null, "recipient_type" text check ("recipient_type" in ('seller', 'admin')) not null, "seller_id" text null, "type" text not null, "title" text not null, "body" text null, "link" text null, "read_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "notification_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_notification_item_recipient_type" ON "notification_item" ("recipient_type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_notification_item_seller_id" ON "notification_item" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_notification_item_deleted_at" ON "notification_item" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "notification_item" cascade;`);
  }

}
