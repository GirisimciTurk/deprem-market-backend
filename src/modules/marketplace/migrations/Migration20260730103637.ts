import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260730103637 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_order" add column if not exists "preparing_at" timestamptz null;`);

    // GERİYE DÖNÜK UYUM: mevcut alt-siparişlerin hepsine preparing_at = created_at.
    // Bu satır olmadan tüm geçmiş siparişler 4 aşamalı çizelgede "Sipariş Alındı"ya
    // geri düşerdi; oysa müşteri bugün onları "Hazırlanıyor" olarak görüyor.
    // Böylece: eski pending → "Hazırlanıyor" (bugünkünün aynısı, kimse geri gitmez),
    // eski fulfilled → "Kargoya Verildi" (bugün yanlışlıkla 2. adımda çakılı, düzelir).
    //
    // fulfilled_at / eligible_at / payout_status'a DOKUNULMUYOR → hiçbir satıcının
    // ödeme tarihi kaymaz, hakediş cron'u aynı kayıt kümesini görmeye devam eder.
    // Yalnız NULL olanlar yazılır → migration tekrar koşarsa idempotent.
    this.addSql(
      `update "seller_order" set "preparing_at" = "created_at" where "preparing_at" is null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_order" drop column if exists "preparing_at";`);
  }

}
