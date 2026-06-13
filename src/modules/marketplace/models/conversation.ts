import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Müşteri ↔ satıcı özel mesajlaşma konuşması (Trendyol "Satıcıya Soru Sor" / mesaj).
 * Bir müşteri ile bir satıcı arasında TEK açık konuşma tutulur (get-or-create);
 * opsiyonel olarak bir siparişe (order_id) bağlanabilir (sipariş detayından açıldıysa).
 *
 * Okunmamış sayaçları her iki taraf için ayrı tutulur (panel zil/rozet için):
 *   - seller_unread: satıcının okumadığı mesaj sayısı (müşteri yazınca artar, satıcı thread'i açınca sıfırlanır)
 *   - customer_unread: müşterinin okumadığı (satıcı yazınca artar, müşteri thread'i açınca sıfırlanır)
 *
 * Müşteri kimliği denormalize (ürün/sipariş bağlamından bağımsız çalışsın).
 */
const Conversation = model.define("conversation", {
  id: model.id().primaryKey(),
  seller: model.belongsTo(() => Seller, { mappedBy: "conversations" }),
  customer_id: model.text().index(),
  customer_name: model.text(),
  customer_email: model.text().nullable(),
  order_id: model.text().index().nullable(),
  order_display_id: model.text().nullable(),
  subject: model.text().nullable(),
  status: model.enum(["open", "closed"]).default("open").index(),
  last_message_at: model.dateTime().nullable(),
  last_message_preview: model.text().nullable(),
  last_sender_type: model.enum(["customer", "seller"]).nullable(),
  seller_unread: model.number().default(0),
  customer_unread: model.number().default(0),
  messages: model.hasMany(() => ConversationMessage, { mappedBy: "conversation" }),
})

/**
 * Konuşmadaki tek bir mesaj. sender_type mesajı kimin yazdığını belirtir
 * (customer | seller). Admin yalnız gözetim amacıyla okur, mesaj yazmaz.
 */
export const ConversationMessage = model.define("conversation_message", {
  id: model.id().primaryKey(),
  conversation: model.belongsTo(() => Conversation, { mappedBy: "messages" }),
  sender_type: model.enum(["customer", "seller"]).index(),
  body: model.text(),
})

export default Conversation
