import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BLOG_MODULE } from "../modules/blog"
import BlogModuleService from "../modules/blog/service"

const STARTER = [
  {
    title: "Deprem Çantası Nasıl Hazırlanır?",
    slug: "deprem-cantasi-nasil-hazirlanir",
    category: "Deprem Hazırlığı",
    summary:
      "Deprem sonrasında hayati öneme sahip malzemelerin bulunduğu deprem çantasını hazırlarken dikkat etmeniz gerekenler.",
    content:
      "Deprem çantasında bulunması gereken temel malzemeler: su, yüksek kalorili dayanıklı gıdalar, ilk yardım çantası, el feneri, pilli radyo ve yedek piller, acil durum battaniyesi, hijyen paketleri ve kişisel belgelerin kopyaları. Çantayı kolay ulaşılabilir bir yerde tutun ve içeriğini 6 ayda bir kontrol edin.",
    author: "Afet Yönetim Uzmanı",
    status: "published" as const,
  },
  {
    title: "Afet Sırasında Doğru Davranış Şekilleri",
    slug: "afet-sirasinda-dogru-davranis",
    category: "Acil Durum Bilgileri",
    summary:
      "Deprem sarsıntısı başladığı anda yapılması gereken Çök-Kapan-Tutun hareketi ve tahliye kuralları.",
    content:
      "Sarsıntı sırasında panik yapmadan güvenli bir yerde Çök-Kapan-Tutun hareketini yapın. Merdivenlerden, pencerelerden ve asansörlerden uzak durun. Sarsıntı geçtikten sonra önceden belirlenen tahliye planına göre güvenli açık alana çıkın.",
    author: "Afet Yönetim Uzmanı",
    status: "published" as const,
  },
  {
    title: "Çocuklara Afet Bilinci Nasıl Kazandırılır?",
    slug: "cocuklara-afet-bilinci",
    category: "Genel",
    summary:
      "Çocukları korkutmadan deprem bilinci aşılamanın yolları ve ev içi tatbikat yöntemleri.",
    content:
      "Çocuklara deprem konusunu oyunlaştırarak ve sakin bir dille anlatın. Ailece yapacağınız ev içi tatbikatlar, acil durumda ne yapacaklarını panik yapmadan hatırlamalarını kolaylaştırır.",
    author: "Psikolog Merve Kaya",
    status: "published" as const,
  },
]

export default async function setupBlog({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const blog: BlogModuleService = container.resolve(BLOG_MODULE)

  const existing = await blog.listBlogPosts({}, { take: 1 })
  if (existing.length) {
    logger.info("[setup-blog] Blog yazıları zaten mevcut, atlanıyor.")
    return
  }

  for (const post of STARTER) {
    await blog.createBlogPosts({ ...post, published_at: new Date() })
  }
  logger.info(`[setup-blog] ${STARTER.length} başlangıç blog yazısı oluşturuldu.`)
}
