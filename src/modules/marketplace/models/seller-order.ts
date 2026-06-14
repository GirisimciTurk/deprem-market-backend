import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Satıcı alt-siparişi — bir müşteri siparişinin tek bir satıcıya düşen parçası.
 * Çok-satıcılı sepette sipariş, order.placed anında satıcı bazında bölünür ve
 * her satıcı için bir seller_order üretilir. Komisyon burada anlık (snapshot)
 * hesaplanır; payout (satıcıya ödeme) bu kayıt üzerinden manuel işaretlenir.
 *
 * Tutarlar minor unit (kuruş) cinsindendir — Medusa order item unit_price ile aynı.
 */
const SellerOrder = model.define("seller_order", {
  id: model.id().primaryKey(),
  seller: model.belongsTo(() => Seller, { mappedBy: "orders" }),
  // Ana Medusa siparişi (referans; ayrı modülde olduğu için link değil text).
  order_id: model.text().index(),
  display_id: model.text().nullable(),
  customer_email: model.text().nullable(),
  currency_code: model.text().default("try"),
  // Bu satıcıya düşen kalemlerin ara toplamı (kuruş).
  subtotal: model.number().default(0),
  commission_rate: model.number().default(0),
  commission_amount: model.number().default(0),
  // Satıcının brüt kazancı = subtotal - commission_amount.
  seller_earning: model.number().default(0),
  // Desi-bazlı kargo ücreti (satıcı maliyeti, kuruş). Net ödenecek tutardan
  // ayrıca düşülür: net = seller_earning - returned_earning - cargo_fee.
  // İade olsa bile kargo ücreti iade edilmez (gönderim yapılmıştır).
  // HİBRİT KARGO: bu alan EFEKTİF düşülen ücrettir. Anlaşmalı kargoda (Yurtiçi)
  // platform_cargo_fee'ye eşittir; satıcı kendi kargosuyla gönderirse 0 olur
  // (fulfill anında carrier'a göre ayarlanır).
  cargo_fee: model.number().default(0),
  // Desi-bazlı platform (anlaşmalı) kargo ücreti — split anında hesaplanır ve
  // sabit kalır. cargo_fee bundan türetilir; satıcı firma değiştirip tekrar
  // kargolarsa ücret buradan geri yüklenebilir.
  platform_cargo_fee: model.number().default(0),
  item_count: model.number().default(0),
  // İade agregaları (order.return_received ile güncellenir). Net ödenecek =
  // seller_earning - returned_earning.
  returned_subtotal: model.number().default(0),
  returned_commission: model.number().default(0),
  returned_earning: model.number().default(0),
  // Kalem anlık görüntüsü: [{ product_id, title, variant_title, quantity, unit_price, line_total, thumbnail }]
  items: model.json().nullable(),
  // Satıcının kargolayabilmesi için teslim adresi anlık görüntüsü.
  shipping_address: model.json().nullable(),
  fulfillment_status: model.enum(["pending", "fulfilled", "canceled"]).default("pending").index(),
  // Hakediş/ödeme döngüsü: pending (kargolanmadı ya da bekleme süresinde) →
  // eligible (hakediş etti, ödenebilir) → paid (ödendi).
  payout_status: model.enum(["pending", "eligible", "paid"]).default("pending").index(),
  // Satıcının kendi kargolaması — kargo firması kodu (cargo.ts CarrierCode),
  // takip numarası ve müşteriye gösterilecek "Kargom Nerede?" linki. Satıcı
  // alt-siparişi kargoladığında doldurulur; müşteriye kargo maili buradan gider.
  carrier: model.text().nullable(),
  tracking_number: model.text().nullable(),
  tracking_url: model.text().nullable(),
  // Kargolandıktan HAKEDIS_DAYS gün sonrası — bu tarihten sonra eligible olur.
  eligible_at: model.dateTime().nullable(),
  paid_at: model.dateTime().nullable(),
  fulfilled_at: model.dateTime().nullable(),
  // PayTR Pazaryeri transfer (escrow serbest bırakma) referansı — payout anında
  // submitPlatformTransfer ile üretilir; başarılı transferin trans_id'si.
  payout_trans_id: model.text().nullable(),
  note: model.text().nullable(),
})

export default SellerOrder
