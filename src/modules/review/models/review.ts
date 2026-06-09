import { model } from "@medusajs/framework/utils"

/**
 * A customer-submitted product review. New reviews start as `pending` and only
 * become visible on the storefront once an admin sets them to `approved`
 * ("Yayınla"). `spam` hides them without deleting.
 */
const ProductReview = model.define("product_review", {
  id: model.id().primaryKey(),
  // Denormalized product info so the admin list and storefront can render
  // without extra joins (and keep working if the product is later removed).
  product_id: model.text().index(),
  product_handle: model.text().index(),
  product_title: model.text(),
  customer_id: model.text().index().nullable(),
  customer_name: model.text(),
  rating: model.number(),
  comment: model.text(),
  status: model.enum(["pending", "approved", "spam"]).default("pending"),
  images: model.json().nullable(),
})

export default ProductReview
