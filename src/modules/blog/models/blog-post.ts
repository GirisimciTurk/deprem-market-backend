import { model } from "@medusajs/framework/utils"

/**
 * Blog yazısı — admin panelden yönetilir, storefront yayınlananları gösterir.
 * `draft` yazılar storefront'ta görünmez; `published` olunca yayınlanır.
 */
const BlogPost = model.define("blog_post", {
  id: model.id().primaryKey(),
  title: model.text(),
  slug: model.text().unique(),
  category: model.text().nullable(),
  summary: model.text().nullable(),
  content: model.text().default(""),
  author: model.text().default(""),
  status: model.enum(["draft", "published"]).default("draft"),
  cover_image: model.text().nullable(),
  related_products: model.json().nullable(),
  published_at: model.dateTime().nullable(),
})

export default BlogPost
