import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import type MarketplaceModuleService from "../../../modules/marketplace/service"

/**
 * GET /store/seller-contracts — yayında (is_active) olan satıcı sözleşmelerini,
 * satıcı olmak isteyenlerin BAŞVURU sayfasında okuyabilmesi için döndürür (public).
 * Bağlayıcı dijital onay, satıcı panelinde (ContractGate) IP+kimlik kaydıyla alınır.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const mp = req.scope.resolve(MARKETPLACE_MODULE) as MarketplaceModuleService
  const contracts = await mp.listSellerContracts(
    { is_active: true } as any,
    { select: ["id", "title", "version", "body", "required"], take: 50 } as any
  )
  // Çerçeve sözleşme en üstte gelsin (örnekleyici sıralama).
  const order = [
    "Satıcı Çerçeve Sözleşmesi (Pazaryeri Hizmet Sözleşmesi)",
    "Komisyon ve Ücret Eki",
    "Yasaklı/Kısıtlı Ürünler ve Satış Kuralları Eki",
    "KVKK Aydınlatma Metni ve Açık Rıza Beyanı (Satıcı)",
  ]
  const sorted = [...(contracts as any[])].sort((a, b) => {
    const ia = order.indexOf(a.title); const ib = order.indexOf(b.title)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return res.json({ contracts: sorted })
}
