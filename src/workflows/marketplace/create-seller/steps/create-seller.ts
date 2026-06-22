import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

export type CreateSellerStepInput = {
  seller: {
    name: string
    handle: string
    legal_name?: string | null
    email?: string | null
    phone?: string | null
    tax_number?: string | null
    iban?: string | null
    account_holder?: string | null
    status?: "pending" | "active" | "suspended"
    commission_rate?: number
    is_house?: boolean
  }
  admin: {
    first_name?: string | null
    last_name?: string | null
    email: string
    phone?: string | null
  }
}

// Satıcı + ilk satıcı kullanıcısını (admin) oluşturur. admin id'sini auth eşlemesi
// için döndürür. Rollback: satıcıyı sil.
export const createSellerStep = createStep(
  "create-seller-step",
  async (input: CreateSellerStepInput, { container }) => {
    const service: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
    const seller = await service.createSellers({ ...input.seller })
    const admin = await service.createSellerAdmins({
      ...input.admin,
      // İlk satıcı kullanıcısı mağazanın SAHİBİ → her zaman tam yetki + ekip yönetimi.
      is_owner: true,
      seller_id: seller.id,
    })
    return new StepResponse(
      { seller, adminId: admin.id },
      { sellerId: seller.id, adminId: admin.id }
    )
  },
  async (compensate, { container }) => {
    if (!compensate) return
    const service: MarketplaceModuleService = container.resolve(MARKETPLACE_MODULE)
    await service.deleteSellerAdmins(compensate.adminId)
    await service.deleteSellers(compensate.sellerId)
  }
)
