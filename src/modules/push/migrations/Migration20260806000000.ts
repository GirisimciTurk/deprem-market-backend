import { Migration } from "@mikro-orm/migrations"

/**
 * "Stoğa gelince haber ver" artık GİRİŞ GEREKTİRİYOR (POST /store/push/stock-alert
 * giriş yoksa 401 döner) ve kayıt cihaza değil HESABA bağlanıyor.
 *
 * Kural öncesi misafirken kurulmuş kayıtlar (customer_id IS NULL) temizleniyor.
 * Ama körlemesine silmiyoruz: bu kayıtların bir bölümü, kullanıcı O CİHAZDAN
 * sonradan giriş yaptığı için aslında bir hesaba AİT. Önce onlar hesaba
 * bağlanır, yalnız gerçekten sahipsiz kalanlar silinir — kullanıcının bilerek
 * kurduğu talep gereksiz yere kaybolmasın.
 *
 * Silme geri alınamaz: down() şemayı değiştirmediği için no-op'tur.
 */
export class Migration20260806000000 extends Migration {
  async up(): Promise<void> {
    // 1) Endpoint'i bir hesaba bağlı olan misafir uyarılarını o hesaba taşı.
    this.addSql(`update "stock_alert" sa
       set "customer_id" = ps."customer_id", "updated_at" = now()
       from "push_subscription" ps
       where ps."endpoint" = sa."endpoint"
         and ps."customer_id" is not null
         and ps."deleted_at" is null
         and sa."customer_id" is null
         and sa."deleted_at" is null;`)

    // 2) Kalan gerçekten sahipsiz kayıtları temizle.
    this.addSql(`delete from "stock_alert" where "customer_id" is null;`)
  }

  async down(): Promise<void> {
    // Silinen misafir kayıtları geri getirilemez; şema değişmediği için no-op.
  }
}
