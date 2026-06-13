import { MARKETPLACE_MODULE } from "../modules/marketplace"
import type MarketplaceModuleService from "../modules/marketplace/service"

export type ContractWithStatus = {
  id: string
  title: string
  version: number
  body: string | null
  pdf_url: string | null
  required: boolean
  accepted: boolean
  accepted_at: string | null
}

/**
 * Aktif sözleşmeleri, bu satıcının her birini GÜNCEL sürümüyle onaylayıp onaylamadığı
 * bilgisiyle döndürür. `accepted` = satıcının o sözleşmenin mevcut version'ını onaylamış
 * olması (sürüm artarsa yeniden onay gerekir).
 */
export async function listContractsForSeller(
  container: any,
  sellerId: string
): Promise<ContractWithStatus[]> {
  const marketplace: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)

  const contracts = await marketplace.listSellerContracts(
    { is_active: true },
    { order: { created_at: "ASC" } }
  )
  if (contracts.length === 0) return []

  const acceptances = await marketplace.listSellerContractAcceptances({ seller_id: sellerId })
  const acceptedKey = new Set(
    acceptances.map((a: any) => `${a.contract_id}:${a.version}`)
  )
  const acceptedAt = new Map<string, string>()
  for (const a of acceptances as any[]) {
    acceptedAt.set(`${a.contract_id}:${a.version}`, a.created_at)
  }

  return (contracts as any[]).map((c) => {
    const key = `${c.id}:${c.version}`
    return {
      id: c.id,
      title: c.title,
      version: c.version,
      body: c.body ?? null,
      pdf_url: c.pdf_url ?? null,
      required: !!c.required,
      accepted: acceptedKey.has(key),
      accepted_at: acceptedAt.get(key) ?? null,
    }
  })
}

/**
 * Satıcının onaylaması GEREKEN (required + aktif + güncel sürümü henüz onaylanmamış)
 * sözleşmeleri döndürür. Boşsa satıcı satış yapabilir.
 */
export async function getPendingRequiredContracts(
  container: any,
  sellerId: string
): Promise<ContractWithStatus[]> {
  const all = await listContractsForSeller(container, sellerId)
  return all.filter((c) => c.required && !c.accepted)
}
