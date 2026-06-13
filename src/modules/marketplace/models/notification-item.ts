import { model } from "@medusajs/framework/utils"

/**
 * Uygulama-içi bildirim (satıcı paneli + admin kontrol merkezi zil ikonu).
 * recipient_type="seller" → seller_id dolu (o satıcıya); "admin" → seller_id null (tüm adminlere).
 * link: panel-içi göreli yol (ör. "/sorular", "/orders").
 *
 * NOT: Medusa core'un Notification modülü E-POSTA/SMS gönderimi içindir; bu model
 * panel-içi okunmamış-sayaçlı bildirim akışı için ayrı tutulur (notification_item).
 */
const NotificationItem = model.define("notification_item", {
  id: model.id().primaryKey(),
  recipient_type: model.enum(["seller", "admin"]).index(),
  seller_id: model.text().index().nullable(),
  type: model.text(),
  title: model.text(),
  body: model.text().nullable(),
  link: model.text().nullable(),
  read_at: model.dateTime().nullable(),
})

export default NotificationItem
