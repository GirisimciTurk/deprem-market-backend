import { MedusaService } from "@medusajs/framework/utils"
import BlogPost from "./models/blog-post"

class BlogModuleService extends MedusaService({
  BlogPost,
}) {}

export default BlogModuleService
