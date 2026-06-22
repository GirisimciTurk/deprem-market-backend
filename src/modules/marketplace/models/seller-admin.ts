import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

/**
 * Satıcı kullanıcısı — satıcı panelinde oturum açan kişi. Auth identity ile
 * (actor_type "seller") setAuthAppMetadataStep üzerinden eşlenir.
 *
 * Yetkilendirme (RBAC):
 *  - is_owner: mağazanın sahibi (ilk kayıt olan / başvuru sahibi). Her zaman TAM
 *    yetkilidir; çalışan davet/silme/izin değiştirir.
 *  - role: atanan hazır rol şablonunun anahtarı (depo/muhasebe/satis... veya
 *    "custom"). Bilgi amaçlı; gerçek yetki `permissions` alanındadır.
 *  - permissions: bölüm-bazlı izin haritası { [section]: "none"|"view"|"full" }.
 *    NULL ise (geriye dönük uyumluluk) kullanıcı SAHİP gibi tam yetkili sayılır —
 *    yeni davet edilen çalışanlara her zaman dolu bir harita yazılır.
 *  - status: active | disabled (askıya alınan çalışan giriş yapamaz).
 */
const SellerAdmin = model.define("seller_admin", {
  id: model.id().primaryKey(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  email: model.text().unique(),
  phone: model.text().nullable(),
  is_owner: model.boolean().default(false),
  role: model.text().nullable(),
  permissions: model.json().nullable(),
  status: model.enum(["active", "disabled"]).default("active").index(),
  seller: model.belongsTo(() => Seller, { mappedBy: "admins" }),
})

export default SellerAdmin
