import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { BLOG_MODULE } from "../../../../modules/blog"
import BlogModuleService from "../../../../modules/blog/service"

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().optional(),
  category: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  content: z.string().optional(),
  author: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
  cover_image: z.string().optional().nullable(),
  related_products: z.array(z.string()).optional().nullable(),
})

/** POST /admin/blog/:id — güncelle. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz blog verisi." })
  }
  const blog: BlogModuleService = req.scope.resolve(BLOG_MODULE)

  const existing = await blog.retrieveBlogPost(req.params.id).catch(() => null)
  if (!existing) return res.status(404).json({ message: "Yazı bulunamadı." })

  const data = parsed.data
  const update: Record<string, unknown> = { id: req.params.id, ...data }

  // draft → published geçişinde published_at ayarla
  if (data.status === "published" && existing.status !== "published" && !existing.published_at) {
    update.published_at = new Date()
  }

  const post = await blog.updateBlogPosts(update as any)
  return res.json({ post })
}

/** DELETE /admin/blog/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const blog: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  await blog.deleteBlogPosts(req.params.id)
  return res.json({ id: req.params.id, object: "blog_post", deleted: true })
}
