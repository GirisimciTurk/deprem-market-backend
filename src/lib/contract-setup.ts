import { MARKETPLACE_MODULE } from "../modules/marketplace"
import type MarketplaceModuleService from "../modules/marketplace/service"
import { CONTRACT_TEMPLATES } from "./seller-contract-templates"

/**
 * Pazaryeri satıcı sözleşmelerini (Çerçeve + KVKK + Komisyon Eki + Yasaklı Ürünler)
 * seller_contract tablosuna kurar. INSTALL-ONCE: aynı başlıklı sözleşme zaten varsa
 * DOKUNMAZ (admin'in panelden yaptığı düzenlemeleri/yer-tutucu doldurmalarını ezmez).
 * Eski test placeholder'ı ("Satıcı Çerçeve Sözleşmesi") varsa pasifleştirir.
 * marketplace-setup / cargo-setup ile aynı desen (script + endpoint ortak çağırır).
 */
export async function runContractSetup(container: any) {
  const mp = container.resolve(MARKETPLACE_MODULE) as MarketplaceModuleService
  const result = { created: [] as string[], skipped: [] as string[], deactivated: [] as string[] }

  // 1) Eski test placeholder'ını pasifleştir (gate'ten düşsün).
  const placeholders = await mp.listSellerContracts({ title: "Satıcı Çerçeve Sözleşmesi" } as any)
  for (const p of placeholders as any[]) {
    if (p.is_active) {
      await mp.updateSellerContracts({ id: p.id, is_active: false } as any)
      result.deactivated.push(`${p.title} (v${p.version})`)
    }
  }

  // 2) Yönetilen 4 sözleşmeyi kur (yoksa oluştur, varsa atla).
  for (const t of CONTRACT_TEMPLATES) {
    const existing = await mp.listSellerContracts({ title: t.title } as any)
    if ((existing as any[]).length > 0) {
      result.skipped.push(t.title)
      continue
    }
    await mp.createSellerContracts({
      title: t.title,
      body: t.body,
      version: t.version,
      required: t.required,
      is_active: true,
    } as any)
    result.created.push(t.title)
  }

  return result
}
