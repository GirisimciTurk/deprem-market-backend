import MarketplaceModule from "../modules/marketplace"
import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

// Bir satıcı → çok ürün. Ürünün hangi satıcıya ait olduğunu bu link tutar.
export default defineLink(MarketplaceModule.linkable.seller, {
  linkable: ProductModule.linkable.product,
  isList: true,
})
