import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createPriceListsWorkflow,
  deletePriceListsWorkflow,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

export type CampaignInput = {
  name: string
  discount_type: "percentage" | "fixed"
  /** percentage: yüzde (1-99). fixed: ürün başına düşülen KURUŞ tutarı. */
  discount_value: number
  /** Hedef ürün id'leri (satıcının kendi ürünleri). */
  product_ids: string[]
  starts_at?: string | null
  ends_at?: string | null
}

/** Kampanyanın zamansal+yönetsel canlı durumu. */
export type CampaignLiveStatus = "scheduled" | "active" | "expired" | "ended"

export function campaignLiveStatus(c: any, now = new Date()): CampaignLiveStatus {
  if (c.status === "ended") return "ended"
  const starts = c.starts_at ? new Date(c.starts_at) : null
  const ends = c.ends_at ? new Date(c.ends_at) : null
  if (ends && ends.getTime() <= now.getTime()) return "expired"
  if (starts && starts.getTime() > now.getTime()) return "scheduled"
  return "active"
}

/** İndirimli tutarı (kuruş) hesaplar; geçersizse null. */
function discountedAmount(base: number, type: string, value: number): number | null {
  if (!Number.isFinite(base) || base <= 0) return null
  let out: number
  if (type === "percentage") {
    if (value <= 0 || value >= 100) return null
    out = Math.round(base * (1 - value / 100))
  } else {
    if (value <= 0) return null
    out = base - value
  }
  if (out <= 0 || out >= base) return null
  return out
}

/**
 * Satıcı kampanyası oluşturur: hedef ürünlerin (yalnız satıcının kendi ürünleri)
 * varyantları için indirimli fiyatlarla bir Medusa price list (type=sale) açar ve
 * SellerCampaign kaydını üretir. İndirim satıcının marjından düşer.
 */
export async function createSellerCampaign(
  scope: any,
  seller: { id: string; handle: string },
  input: CampaignInput
) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const marketplace: MarketplaceModuleService = scope.resolve(MARKETPLACE_MODULE)

  // 1) Satıcının kendi ürün id kümesi (ürünü seller ile filtrelemek query.graph'ta
  // çalışmaz → seller→products yönünden al).
  const { data: sellerRows } = await query.graph({
    entity: "seller",
    fields: ["products.id"],
    filters: { id: seller.id },
  })
  const ownIds = new Set<string>(
    ((sellerRows[0] as any)?.products ?? []).map((p: any) => p.id)
  )
  const targetIds = [...new Set(input.product_ids)].filter((id) => ownIds.has(id))
  if (targetIds.length === 0) {
    throw new Error("Kampanya için kendi ürünlerinizden en az biri seçilmeli.")
  }

  // 2) Ürün + varyant taban fiyatlarını çek (price_list_id null = taban fiyat).
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "variants.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_list_id",
    ],
    filters: { id: targetIds },
  })

  const prices: { variant_id: string; amount: number; currency_code: string }[] = []
  for (const p of products as any[]) {
    for (const v of p.variants ?? []) {
      const base = (v.prices ?? []).find(
        (pr: any) => pr.currency_code === "try" && !pr.price_list_id
      )?.amount
      const disc = discountedAmount(Number(base), input.discount_type, input.discount_value)
      if (disc != null) {
        prices.push({ variant_id: v.id, amount: disc, currency_code: "try" })
      }
    }
  }
  if (prices.length === 0) {
    throw new Error(
      "İndirim uygulanabilir varyant bulunamadı (taban fiyat yok ya da indirim geçersiz)."
    )
  }

  // 3) Price list (type=sale varsayılan) oluştur.
  const { result } = await createPriceListsWorkflow(scope).run({
    input: {
      price_lists_data: [
        {
          title: `Kampanya: ${input.name} — ${seller.handle}`,
          description: `Satıcı kampanyası (${seller.id})`,
          status: "active",
          starts_at: input.starts_at ?? null,
          ends_at: input.ends_at ?? null,
          prices,
        },
      ],
    },
  })
  const priceList = (result as any[])[0]

  // 4) SellerCampaign kaydı.
  const snapshot = (products as any[]).map((p) => ({ id: p.id, title: p.title }))
  const created = await marketplace.createSellerCampaigns({
    seller_id: seller.id,
    price_list_id: priceList.id,
    name: input.name,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    status: "active",
    starts_at: input.starts_at ?? null,
    ends_at: input.ends_at ?? null,
    product_ids: snapshot,
    variant_count: prices.length,
  } as any)

  return created
}

/**
 * Kampanyayı bitirir: arkadaki price list'i siler (fiyatlar tabana döner) ve
 * SellerCampaign'i "ended" işaretler. İdempotent.
 */
export async function endSellerCampaign(scope: any, campaign: any) {
  if (campaign.price_list_id) {
    await deletePriceListsWorkflow(scope)
      .run({ input: { ids: [campaign.price_list_id] } })
      .catch(() => {
        // Price list zaten silinmişse yoksay.
      })
  }
  const marketplace: MarketplaceModuleService = scope.resolve(MARKETPLACE_MODULE)
  await marketplace.updateSellerCampaigns({ id: campaign.id, status: "ended" } as any)
}
