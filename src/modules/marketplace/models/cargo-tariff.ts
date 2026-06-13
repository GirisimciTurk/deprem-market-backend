import { model } from "@medusajs/framework/utils"

/**
 * Desi-bazlı kargo tarifesi (tekil/singleton config). Trendyol/Hepsiburada modeli:
 * kargo ücreti gönderinin desi'sine göre hesaplanır ve SATICININ hakedişinden
 * düşülür (satıcı maliyeti). Platformun kargo anlaşmasına göre admin düzenler.
 *
 * tiers: artan sıralı kademeler — [{ max_desi, fee(kuruş) }]. Bir gönderinin
 * desi'si <= max_desi olan İLK kademenin ücreti uygulanır. Son kademeyi aşarsa
 * son kademe ücreti + (aşan desi × per_extra_fee).
 *
 * Tek satır tutulur (get-or-create); SINGLETON_ID ile erişilir.
 */
const CargoTariff = model.define("cargo_tariff", {
  id: model.id().primaryKey(),
  // [{ max_desi: number, fee: number(kuruş) }] artan sıralı.
  tiers: model.json(),
  // Son kademeyi aşan her desi için eklenen ücret (kuruş).
  per_extra_fee: model.number().default(0),
})

export default CargoTariff
