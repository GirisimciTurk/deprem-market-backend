import { model } from "@medusajs/framework/utils"

/**
 * HAVAR (hava aracı / drone) ön talep kaydı — storefront /havar formundan gelir.
 * type: purchase (ön alım) | rental (ön kiralama). Admin panelden değerlendirilir.
 * want_door_mechanism: apartman kapı/çıkış mekanizması da isteniyor mu (ayrı bayi hizmeti).
 */
const HavarRequest = model.define("havar_request", {
  id: model.id().primaryKey(),
  type: model.enum(["purchase", "rental"]).index(),
  full_name: model.text(),
  email: model.text().index(),
  phone: model.text().default(""),
  city: model.text().default(""),
  // Birey mi aile mi
  buyer_type: model.enum(["individual", "family"]).default("individual"),
  // Kullanım amacı: kargo / insan taşıma / her ikisi
  usage: model.enum(["cargo", "human", "both"]).default("both"),
  quantity: model.number().default(1),
  // Apartman kapı/çıkış mekanizması da isteniyor mu (ayrı bayi hizmeti)
  want_door_mechanism: model.boolean().default(false),
  // Kiralama için tahmini süre (ör. "3 ay"); ön alımda boş
  rental_duration: model.text().default(""),
  note: model.text().default(""),
  status: model.enum(["pending", "reviewed", "contacted", "closed"]).default("pending").index(),
})

export default HavarRequest
