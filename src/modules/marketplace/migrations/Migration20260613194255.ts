import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613194255 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "conversation" ("id" text not null, "seller_id" text not null, "customer_id" text not null, "customer_name" text not null, "customer_email" text null, "order_id" text null, "order_display_id" text null, "subject" text null, "status" text check ("status" in ('open', 'closed')) not null default 'open', "last_message_at" timestamptz null, "last_message_preview" text null, "last_sender_type" text check ("last_sender_type" in ('customer', 'seller')) null, "seller_unread" integer not null default 0, "customer_unread" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "conversation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_seller_id" ON "conversation" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_customer_id" ON "conversation" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_order_id" ON "conversation" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_status" ON "conversation" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_deleted_at" ON "conversation" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "conversation_message" ("id" text not null, "conversation_id" text not null, "sender_type" text check ("sender_type" in ('customer', 'seller')) not null, "body" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "conversation_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_message_conversation_id" ON "conversation_message" ("conversation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_message_sender_type" ON "conversation_message" ("sender_type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_conversation_message_deleted_at" ON "conversation_message" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "conversation" add constraint "conversation_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "conversation_message" add constraint "conversation_message_conversation_id_foreign" foreign key ("conversation_id") references "conversation" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "conversation_message" drop constraint if exists "conversation_message_conversation_id_foreign";`);

    this.addSql(`drop table if exists "conversation" cascade;`);

    this.addSql(`drop table if exists "conversation_message" cascade;`);
  }

}
