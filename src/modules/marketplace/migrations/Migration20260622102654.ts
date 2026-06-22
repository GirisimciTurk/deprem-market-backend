import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260622102654 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "seller_audit_log" ("id" text not null, "actor_admin_id" text null, "actor_name" text null, "actor_email" text null, "action" text not null, "summary" text not null, "entity_type" text null, "entity_id" text null, "method" text null, "path" text null, "status" integer null, "metadata" jsonb null, "seller_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_audit_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_audit_log_actor_admin_id" ON "seller_audit_log" ("actor_admin_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_audit_log_action" ON "seller_audit_log" ("action") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_audit_log_seller_id" ON "seller_audit_log" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_audit_log_deleted_at" ON "seller_audit_log" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_audit_log" add constraint "seller_audit_log_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "seller_admin" add column if not exists "is_owner" boolean not null default false, add column if not exists "role" text null, add column if not exists "permissions" jsonb null, add column if not exists "status" text check ("status" in ('active', 'disabled')) not null default 'active';`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_admin_status" ON "seller_admin" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_audit_log" cascade;`);

    this.addSql(`drop index if exists "IDX_seller_admin_status";`);
    this.addSql(`alter table if exists "seller_admin" drop column if exists "is_owner", drop column if exists "role", drop column if exists "permissions", drop column if exists "status";`);
  }

}
