import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { isLlmEnabled, generateBlogPost } from "../../../../lib/llm"

/**
 * POST /admin/blog/generate  { topic, category?, keywords? }
 * Verilen konudan AI (Gemini) ile bir blog yazısı taslağı üretir
 * (title/slug/summary/content[markdown]/category). Admin-only.
 * Kaydetmez — admin önizleyip /admin/blog ile taslak/yayın olarak kaydeder.
 */
const schema = z.object({
  topic: z.string().trim().min(3).max(300),
  category: z.string().trim().max(80).optional().nullable(),
  keywords: z.string().trim().max(300).optional().nullable(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçerli bir konu yazın (3-300 karakter).", issues: parsed.error.issues })
  }
  if (!isLlmEnabled()) {
    return res.status(503).json({ message: "AI özelliği kapalı (GEMINI_API_KEY tanımlı değil)." })
  }

  const out = await generateBlogPost(parsed.data)
  if (!out.ok) {
    return res.status(502).json({ message: out.error || "AI içerik üretemedi." })
  }
  return res.json({ post: out.data })
}
