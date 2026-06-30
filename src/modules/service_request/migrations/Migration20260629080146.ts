import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260629080146 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "service_request" add column if not exists "is_bidding" boolean not null default false, add column if not exists "bids" jsonb null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_service_request_is_bidding" ON "service_request" ("is_bidding") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_service_request_is_bidding";`);
    this.addSql(`alter table if exists "service_request" drop column if exists "is_bidding", drop column if exists "bids";`);
  }

}
