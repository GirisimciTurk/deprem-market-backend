import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260615062252 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "havar_request" ("id" text not null, "type" text check ("type" in ('purchase', 'rental')) not null, "full_name" text not null, "email" text not null, "phone" text not null default '', "city" text not null default '', "buyer_type" text check ("buyer_type" in ('individual', 'family')) not null default 'individual', "usage" text check ("usage" in ('cargo', 'human', 'both')) not null default 'both', "quantity" integer not null default 1, "want_door_mechanism" boolean not null default false, "rental_duration" text not null default '', "note" text not null default '', "status" text check ("status" in ('pending', 'reviewed', 'contacted', 'closed')) not null default 'pending', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "havar_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_havar_request_type" ON "havar_request" ("type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_havar_request_email" ON "havar_request" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_havar_request_status" ON "havar_request" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_havar_request_deleted_at" ON "havar_request" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "havar_request" cascade;`);
  }

}
