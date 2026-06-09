import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../modules/blog"
import BlogModuleService from "../../../modules/blog/service"

/** Storefront blog post DTO (storefront lib/data/blog.ts ile uyumlu). */
function toStorefront(p: any) {
  return {
    slug: p.slug,
    title: p.title,
    description: p.summary || "",
    date: (p.published_at || p.created_at || new Date()).toString(),
    author: p.author || "",
    image: p.cover_image || "",
    category: p.category || "",
    related_products: p.related_products || [],
    content: p.content || "",
  }
}

/** GET /store/blog — yayınlanmış yazılar (en yeni önce). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const blog: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const posts = await blog.listBlogPosts(
    { status: "published" },
    { order: { published_at: "DESC" }, take: 200 }
  )
  return res.json({ posts: posts.map(toStorefront) })
}
