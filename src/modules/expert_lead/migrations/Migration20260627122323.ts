import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260627122323 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "expert_request" ("id" text not null, "expert_id" text not null, "expert_slug" text not null default '', "expert_name" text not null default '', "customer_name" text not null, "customer_phone" text not null default '', "customer_email" text not null default '', "city" text not null default '', "topic" text not null default '', "message" text not null default '', "status" text check ("status" in ('new', 'forwarded', 'closed')) not null default 'new', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "expert_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_request_expert_id" ON "expert_request" ("expert_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_request_status" ON "expert_request" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_expert_request_deleted_at" ON "expert_request" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "expert_request" cascade;`);
  }

}
