import { model } from "@medusajs/framework/utils"

/**
 * Bir tarayıcı/cihazın web push aboneliği.
 *
 * `endpoint`, push servisinin (FCM, Mozilla autopush, Apple, vb.) verdiği
 * benzersiz URL'dir; aynı endpoint tekrar abone olursa upsert edilir.
 * Giriş yapmış kullanıcıda `customer_id` doldurulur → sipariş bildirimleri
 * müşteriye göre bulunur. Misafir abonelikleri `customer_id=null` (yalnızca
 * pazarlama/genel yayın ve abone oldukları stok uyarılarını alır).
 */
const PushSubscription = model.define("push_subscription", {
  id: model.id().primaryKey(),
  endpoint: model.text().unique(),
  // Tarayıcının ürettiği şifreleme anahtarları (web-push gönderiminde gerekli).
  p256dh: model.text(),
  auth: model.text(),
  customer_id: model.text().index().nullable(),
  user_agent: model.text().nullable(),
  // Bildirim metnini doğru dilde kurmak için (tr/en).
  locale: model.text().nullable(),
})

export default PushSubscription
