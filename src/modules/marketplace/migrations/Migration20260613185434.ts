import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613185434 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "product_question" ("id" text not null, "product_id" text not null, "product_handle" text null, "product_title" text not null, "seller_id" text not null, "customer_id" text null, "customer_name" text not null, "customer_email" text null, "question" text not null, "answer" text null, "status" text check ("status" in ('pending', 'answered', 'rejected')) not null default 'pending', "answered_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_question_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_question_product_id" ON "product_question" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_question_seller_id" ON "product_question" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_question_customer_id" ON "product_question" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_question_status" ON "product_question" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_question_deleted_at" ON "product_question" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "product_question" add constraint "product_question_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_question" cascade;`);
  }

}
