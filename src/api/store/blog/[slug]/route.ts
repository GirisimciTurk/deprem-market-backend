import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"
import BlogModuleService from "../../../../modules/blog/service"

/** GET /store/blog/:slug — tek yayınlanmış yazı. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const blog: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const posts = await blog.listBlogPosts({ slug: req.params.slug, status: "published" }, { take: 1 })
  const p = posts[0]
  if (!p) return res.status(404).json({ message: "Yazı bulunamadı." })

  return res.json({
    post: {
      slug: p.slug,
      title: p.title,
      description: p.summary || "",
      date: (p.published_at || p.created_at || new Date()).toString(),
      author: p.author || "",
      image: p.cover_image || "",
      category: p.category || "",
      related_products: p.related_products || [],
      content: p.content || "",
    },
  })
}
