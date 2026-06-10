import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610120719 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "stock_movement" ("id" text not null, "inventory_item_id" text not null, "location_id" text not null, "sku" text null, "product_title" text null, "location_name" text null, "type" text check ("type" in ('sale', 'return', 'manual', 'transfer_in', 'transfer_out', 'count', 'initial')) not null, "quantity_delta" integer not null, "resulting_quantity" integer null, "reason" text null, "reference_id" text null, "actor" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "stock_movement_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_movement_inventory_item_id" ON "stock_movement" ("inventory_item_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_movement_location_id" ON "stock_movement" ("location_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_movement_type" ON "stock_movement" ("type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_stock_movement_deleted_at" ON "stock_movement" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "stock_movement" cascade;`);
  }

}
