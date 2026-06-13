import { MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import SellerOrder from "./models/seller-order"
import SellerReturn from "./models/seller-return"
import CommissionRule from "./models/commission-rule"
import SellerReview from "./models/seller-review"
import SellerContract from "./models/seller-contract"
import SellerContractAcceptance from "./models/seller-contract-acceptance"
import ProductQuestion from "./models/product-question"
import NotificationItem from "./models/notification-item"
import Conversation, { ConversationMessage } from "./models/conversation"
import SellerCampaign from "./models/seller-campaign"

// Otomatik CRUD: createSellers/... + SellerOrders/SellerReturns/CommissionRules/SellerReviews
// /SellerContracts/SellerContractAcceptances/ProductQuestions/NotificationItems...
class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerAdmin,
  SellerOrder,
  SellerReturn,
  CommissionRule,
  SellerReview,
  SellerContract,
  SellerContractAcceptance,
  ProductQuestion,
  NotificationItem,
  Conversation,
  ConversationMessage,
  SellerCampaign,
}) {
  /**
   * Bir satıcının ortalama puanını (rating_avg) ve onaylı değerlendirme sayısını
   * (rating_count) YALNIZ `approved` SellerReview kayıtlarından yeniden hesaplar
   * ve seller'a yazar. Bir değerlendirmenin durumu değiştiğinde çağrılır.
   */
  async recomputeSellerRating(sellerId: string): Promise<void> {
    const approved = await this.listSellerReviews({
      seller_id: sellerId,
      status: "approved",
    })
    const count = approved.length
    const sum = approved.reduce((s: number, r: any) => s + (Number(r.rating) || 0), 0)
    await this.updateSellers({ id: sellerId, rating_sum: sum, rating_count: count } as any)
  }
}

export default MarketplaceModuleService
