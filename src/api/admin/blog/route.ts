import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { BLOG_MODULE } from "../../../modules/blog"
import BlogModuleService from "../../../modules/blog/service"

function slugify(input: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }
  return (input || "")
    .toLowerCase()
    .replace(/[çğıöşü]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || `yazi-${Date.now()}`
}

const createSchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  category: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  content: z.string().optional(),
  author: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
  cover_image: z.string().optional().nullable(),
  related_products: z.array(z.string()).optional().nullable(),
  // Locale-başına çeviriler: { en: { title?, summary?, content? } }
  translations: z
    .record(
      z.string(),
      z.object({
        title: z.string().optional(),
        summary: z.string().optional().nullable(),
        content: z.string().optional(),
      })
    )
    .optional()
    .nullable(),
})

/** GET /admin/blog?status=&q=&limit=&offset= — tüm yazılar (admin). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined
  const q = (req.query.q as string | undefined)?.trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (status && ["draft", "published"].includes(status)) filters.status = status
  if (q) {
    const like = `%${q}%`
    filters.$or = [
      { title: { $ilike: like } },
      { category: { $ilike: like } },
      { author: { $ilike: like } },
    ]
  }

  const blog: BlogModuleService = req.scope.resolve(BLOG_MODULE)
  const [posts, count] = await blog.listAndCountBlogPosts(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })

  return res.json({ posts, count, offset, limit })
}

/** POST /admin/blog — yeni yazı. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz blog verisi.", issues: parsed.error.issues })
  }
  const data = parsed.data
  const blog: BlogModuleService = req.scope.resolve(BLOG_MODULE)

  const status = data.status ?? "draft"
  const post = await blog.createBlogPosts({
    title: data.title,
    slug: data.slug?.trim() || slugify(data.title),
    category: data.category ?? null,
    summary: data.summary ?? null,
    content: data.content ?? "",
    author: data.author ?? "",
    status,
    cover_image: data.cover_image ?? null,
    related_products: (data.related_products ?? null) as any,
    translations: (data.translations ?? null) as any,
    published_at: status === "published" ? new Date() : null,
  })

  return res.status(201).json({ post })
}
