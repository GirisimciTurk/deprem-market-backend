import { MedusaService } from "@medusajs/framework/utils"
import NewsletterSubscriber from "./models/subscriber"

class NewsletterModuleService extends MedusaService({
  NewsletterSubscriber,
}) {}

export default NewsletterModuleService
