import { MedusaService } from "@medusajs/framework/utils"
import ProductReview from "./models/review"

class ReviewModuleService extends MedusaService({
  ProductReview,
}) {}

export default ReviewModuleService
