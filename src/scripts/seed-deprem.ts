import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"

interface ProductSeedDef {
  title: string
  category: string
  price: number // in TRY (will be multiplied by 100 for minor units)
  sku: string
  desc: string
  weight: number
  thumbnail: string
}

const PRODUCT_LIST: ProductSeedDef[] = [
  {
    title: 'Bireysel Deprem Çantası',
    category: 'Deprem Çantaları & Setleri',
    price: 750,
    sku: 'DEP-BIR-01',
    desc: 'Bireysel acil durumlar için özel olarak hazırlanmış, 72 saatlik temel yaşam desteği sunan deprem çantası.',
    weight: 2500,
    thumbnail: 'https://images.unsplash.com/photo-1609587312208-cea54be969e7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Premium Aile Deprem Seti (4 Kişilik)',
    category: 'Deprem Çantaları & Setleri',
    price: 2450,
    sku: 'DEP-FAM-04',
    desc: '4 kişilik bir ailenin afet sonrası ilk 72 saatte ihtiyaç duyabileceği tüm medikal, gıda ve ısınma araçlarını barındıran premium sırt çantalı set.',
    weight: 6500,
    thumbnail: 'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Acil Durum Düdüğü (Yüksek Frekans)',
    category: 'Güvenlik & İletişim',
    price: 45,
    sku: 'DEP-DUD-01',
    desc: '120 dB gücünde ses çıkışı sağlayan, enkaz altında veya acil durumlarda yerinizi belli etmek için tasarlanmış dayanıklı metal düdük.',
    weight: 50,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Katlanabilir Su Bidonu (10 Litre)',
    category: 'Yiyecek & İçecek',
    price: 95,
    sku: 'DEP-BID-10',
    desc: 'BPA içermeyen, dayanıklı ve esnek plastik malzemeden üretilmiş, kullanılmadığında katlanarak yer kaplamayan 10 litrelik su bidonu.',
    weight: 150,
    thumbnail: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Güneş Enerjili Solar El Feneri',
    category: 'Aydınlatma & Enerji',
    price: 350,
    sku: 'DEP-FEN-01',
    desc: 'Güneş paneli ve entegre USB girişi ile şarj edilebilen, enerji kesintilerinde en büyük yardımcınız olacak LED fener.',
    weight: 300,
    thumbnail: 'https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Kranklı Acil Durum Radyosu',
    category: 'Güvenlik & İletişim',
    price: 850,
    sku: 'DEP-RAD-01',
    desc: 'El krankı, güneş paneli ve USB ile şarj olabilen, afet anında kesintisiz haber almanızı sağlayan FM/AM acil durum radyosu ve feneri.',
    weight: 450,
    thumbnail: 'https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Termal Acil Durum Battaniyesi',
    category: 'Isınma & Barınma',
    price: 29,
    sku: 'DEP-BAT-01',
    desc: 'Vücut ısısının %90\'ını muhafaza eden, rüzgar ve su geçirmeyen, hipotermiyi önleyen alüminyum mylar acil durum battaniyesi.',
    weight: 60,
    thumbnail: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Temel İlk Yardım Çantası',
    category: 'İlk Yardım Malzemeleri',
    price: 280,
    sku: 'DEP-IYK-01',
    desc: 'Sargı bezi, yara bandı, antiseptik solüsyon ve temel medikal ekipmanları içeren, çanta içi kullanıma uygun kompakt ilk yardım kiti.',
    weight: 500,
    thumbnail: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Profesyonel Gaz Maskesi (KBRN Uyumlu)',
    category: 'Güvenlik & İletişim',
    price: 1750,
    sku: 'DEP-MSK-01',
    desc: 'Zehirli gaz, duman, toz ve kimyasal sızıntılara karşı tam yüz koruması sağlayan, yüksek filtreleme kapasiteli profesyonel maske seti.',
    weight: 950,
    thumbnail: 'https://images.unsplash.com/photo-1534081333815-ae5019106622?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Çok Amaçlı Kamp Baltası',
    category: 'Güvenlik & İletişim',
    price: 650,
    sku: 'DEP-BLT-01',
    desc: 'Çelik kafalı, kaymaz saplı, enkaz açma ve odun kırma işlerinde kullanıma uygun koruyucu kılıflı balta.',
    weight: 850,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Katlanır Acil Durum Küreği',
    category: 'Güvenlik & İletişim',
    price: 450,
    sku: 'DEP-KRE-01',
    desc: 'Kazma ve kürek fonksiyonlarına sahip, katlanarak özel kılıfında taşınabilen dayanıklı karbon çelik acil durum küreği.',
    weight: 700,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: '3 Günlük Acil Durum Gıda Rasyonu',
    category: 'Yiyecek & İçecek',
    price: 550,
    sku: 'DEP-GID-03',
    desc: '5 yıl raf ömrü bulunan, yüksek kalorili ve pişirme gerektirmeyen, vakumlu paketlenmiş 3 günlük acil durum gıda paketi.',
    weight: 1200,
    thumbnail: 'https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Kimyasal Işık Çubuğu (Glowstick - 5 Adet)',
    category: 'Aydınlatma & Enerji',
    price: 89,
    sku: 'DEP-GLW-05',
    desc: 'Büküldüğünde aktifleşen, pil veya ateş gerektirmeden 12 saat boyunca ışık veren 5 adet kimyasal ışık çubuğu paketi.',
    weight: 120,
    thumbnail: 'https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Telsiz Seti (PMR 2li)',
    category: 'Güvenlik & İletişim',
    price: 1850,
    sku: 'DEP-TEL-02',
    desc: 'Hücresel şebekeler çalışmadığında 5 km mesafeye kadar doğrudan iletişim kurmanızı sağlayan 2\'li el telsizi seti.',
    weight: 480,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Su Arıtma Tableti (50 Kapsül)',
    category: 'Yiyecek & İçecek',
    price: 120,
    sku: 'DEP-TAB-50',
    desc: 'Klor bazlı formülüyle 1 litre kirli suyu 30 dakikada mikroplardan arındırarak içilebilir hale getiren 50 adet tablet.',
    weight: 40,
    thumbnail: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Boyunluk ve Atel Seti',
    category: 'İlk Yardım Malzemeleri',
    price: 340,
    sku: 'DEP-ATL-01',
    desc: 'Afet sırasındaki kırık, çıkık ve burkulmalarda sabitleme amacıyla kullanılan medikal boyunluk ve şekillendirilebilir atel takımı.',
    weight: 350,
    thumbnail: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Cep Tipi Isıtıcı Jel (4lü Paket)',
    category: 'Isınma & Barınma',
    price: 79,
    sku: 'DEP-JEL-04',
    desc: 'Metal pulu büküldüğünde anında kimyasal reaksiyonla ısınan ve saatlerce sıcaklık sağlayan tekrar kullanılabilir 4\'lü jel paket.',
    weight: 220,
    thumbnail: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Acil Durum Barınağı / Çadırı (2 Kişilik)',
    category: 'Isınma & Barınma',
    price: 1950,
    sku: 'DEP-CAD-02',
    desc: 'Afetzedeler için rüzgar, yağmur ve soğuğa dayanıklı malzemeden üretilmiş, kolay kurulan 2 kişilik acil çadır seti.',
    weight: 2200,
    thumbnail: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Statik Kurtarma Halatı (20m)',
    category: 'Güvenlik & İletişim',
    price: 580,
    sku: 'DEP-HAL-20',
    desc: '10.5 mm kalınlığında, yüksek mukavemetli ve sürtünmeye dayanıklı 20 metrelik tırmanma ve tahliye halatı.',
    weight: 1400,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Alüminyum Karabina Seti (4lü)',
    category: 'Güvenlik & İletişim',
    price: 180,
    sku: 'DEP-KAR-04',
    desc: 'Halat sabitleme, yük taşıma ve ekipman bağlama amaçlı kullanılan 4 adet kilitli alüminyum karabina.',
    weight: 160,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Çok Fonksiyonlu Çakı (15 Aparatlı)',
    category: 'Güvenlik & İletişim',
    price: 390,
    sku: 'DEP-CAK-15',
    desc: 'Konserve açacağı, tornavida, makas ve testere gibi 15 farklı fonksiyon barındıran paslanmaz çelik cep çakısı.',
    weight: 180,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Hijyenik Islak Mendil ve Kurulama Bezi',
    category: 'İlk Yardım Malzemeleri',
    price: 45,
    sku: 'DEP-HIJ-01',
    desc: 'Su kullanımının kısıtlı olduğu durumlarda el ve vücut temizliği için üretilmiş antiseptik ıslak havlu kiti.',
    weight: 100,
    thumbnail: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Bebek Acil Durum Destek Paketi',
    category: 'Deprem Çantaları & Setleri',
    price: 980,
    sku: 'DEP-BEB-01',
    desc: 'Bebek maması, steril emzik, bebek bezi, pişik kremi ve ıslak mendil gibi temel bebek bakım ürünlerini içeren acil durum paketi.',
    weight: 3200,
    thumbnail: 'https://images.unsplash.com/photo-1609587312208-cea54be969e7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Evcil Hayvan Acil Durum Seti',
    category: 'Deprem Çantaları & Setleri',
    price: 850,
    sku: 'DEP-PET-01',
    desc: 'Kedi/köpek için kuru mama rasyonu, katlanabilir su kabı, taşıma tasması ve temel pet ilk yardım malzemeleri seti.',
    weight: 2800,
    thumbnail: 'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Reflektörlü İkaz Yeleği',
    category: 'Güvenlik & İletişim',
    price: 65,
    sku: 'DEP-YEL-01',
    desc: 'Arama kurtarma ekiplerinin ve afetzedelerin karanlık ortamlarda fark edilmesini sağlayan yüksek reflektörlü neon sarı yelek.',
    weight: 110,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Koruyucu Baret (Sarı)',
    category: 'Güvenlik & İletişim',
    price: 145,
    sku: 'DEP-BRT-01',
    desc: 'Enkaz alanında baş bölgesini düşen taş, tuğla ve molozlardan korumak için tasarlanmış CE onaylı koruyucu baret.',
    weight: 420,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Kesilmeye Dayanıklı İş Eldiveni',
    category: 'Güvenlik & İletişim',
    price: 95,
    sku: 'DEP-ELD-01',
    desc: 'Cam, metal ve keskin beton kenarlarıyla çalışırken elleri koruyan, nitril kaplı kesilmeye dirençli eldiven.',
    weight: 80,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'FFP3 Toz Maskesi (10lu Paket)',
    category: 'İlk Yardım Malzemeleri',
    price: 160,
    sku: 'DEP-FFP-10',
    desc: 'Enkaz alanındaki zararlı asbest, toz ve ince partiküllerin solunmasını önleyen FFP3 seviyesinde 10 adet maske.',
    weight: 150,
    thumbnail: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'İlaç Saklama ve Taşıma Kutusu',
    category: 'İlk Yardım Malzemeleri',
    price: 68,
    sku: 'DEP-ILC-01',
    desc: 'Kişisel reçeteli ilaçların nemden ve ısıdan korunarak taşınmasını sağlayan, bölmeli ve su geçirmez ilaç kutusu.',
    weight: 90,
    thumbnail: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Yangın Söndürme Battaniyesi (1.2m x 1.2m)',
    category: 'Güvenlik & İletişim',
    price: 290,
    sku: 'DEP-YNG-01',
    desc: 'Küçük ev yangınlarını oksijeni keserek söndürmek veya tahliye esnasında korunmak için kullanılan cam elyaf battaniye.',
    weight: 600,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Yangın Söndürücü Sprey',
    category: 'Güvenlik & İletişim',
    price: 185,
    sku: 'DEP-SPR-01',
    desc: 'Katı, sıvı ve gaz yangınlarında anında müdahale için kullanılan, taşıması kolay 500ml hacimli yangın söndürücü aerosol sprey.',
    weight: 580,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Solar Şarj Paneli (21W)',
    category: 'Aydınlatma & Enerji',
    price: 1450,
    sku: 'DEP-PAN-21',
    desc: 'Katlanabilir tasarımıyla güneş enerjisini USB üzerinden telefon veya powerbank şarjı için doğrudan aktaran 21W güç paneli.',
    weight: 650,
    thumbnail: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Katlanabilir Acil Sedye',
    category: 'İlk Yardım Malzemeleri',
    price: 2750,
    sku: 'DEP-SED-01',
    desc: 'Afet veya kaza anında yaralı taşıma işlerini kolaylaştıran, alüminyum gövdeli ve su geçirmez brandalı katlanır sedye.',
    weight: 4800,
    thumbnail: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Pilli Duman Dedektörü',
    category: 'Güvenlik & İletişim',
    price: 380,
    sku: 'DEP-DMND-01',
    desc: '85 dB ses şiddetinde siren ile duman oluşumlarını önceden bildiren, pilli ve kolay montajlı duman dedektörü.',
    weight: 200,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Gaz Sızıntısı Dedektörü',
    category: 'Güvenlik & İletişim',
    price: 420,
    sku: 'DEP-GAZD-01',
    desc: 'LPG, doğalgaz ve kömür gazı kaçaklarını algılayarak sesli ve ışıklı uyarı veren hassas sensörlü gaz dedektörü.',
    weight: 220,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Deprem Düdüğü Metal',
    category: 'Güvenlik & İletişim',
    price: 35,
    sku: 'DEP-DUD-02',
    desc: 'Paslanmaz çelikten üretilmiş, kordonlu ve anahtarlık tipi pratik taşıma halkası bulunan metal acil durum düdüğü.',
    weight: 30,
    thumbnail: 'https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Kafa Lambası (LED - USB Şarjlı)',
    category: 'Aydınlatma & Enerji',
    price: 195,
    sku: 'DEP-KAF-01',
    desc: 'Ellerinizi serbest bırakarak çalışmanızı sağlayan, ayarlanabilir bantlı ve USB şarjlı yüksek lümenli LED kafa lambası.',
    weight: 120,
    thumbnail: 'https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Mum ve Kibrit Acil Durum Seti',
    category: 'Aydınlatma & Enerji',
    price: 48,
    sku: 'DEP-MUM-10',
    desc: 'Rüzgarda sönmeyen 20 adet avcı kibriti ve 10 adet uzun ömürlü yassı acil durum mumu kiti.',
    weight: 250,
    thumbnail: 'https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Su Geçirmez Evrak Çantası',
    category: 'Deprem Çantaları & Setleri',
    price: 120,
    sku: 'DEP-EVR-01',
    desc: 'Tapu, kimlik kopyaları ve nakit gibi acil durumlarda yanınıza almanız gereken kıymetli evrakları koruyan su ve ısıya dayanıklı çanta.',
    weight: 180,
    thumbnail: 'https://images.unsplash.com/photo-1609587312208-cea54be969e7?auto=format&fit=crop&q=80&w=800'
  },
  {
    title: 'Acil Durum Yağmurluğu (5li)',
    category: 'Isınma & Barınma',
    price: 75,
    sku: 'DEP-YGM-05',
    desc: 'Afet anında ıslanarak hastalanmayı önlemek için tasarlanmış, kapüşonlu ve tek beden 5 adet çıtçıtlı yağmurluk.',
    weight: 200,
    thumbnail: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800'
  }
]

export default async function seedDeprem({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const inventoryModuleService = container.resolve(Modules.INVENTORY)

  logger.info("Cleaning up existing products, collections, categories, and inventory items...")

  // Get and delete existing products
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id"],
  })
  const productIds = products.map((p) => p.id)
  if (productIds.length > 0) {
    await productModuleService.deleteProducts(productIds)
    logger.info(`Deleted ${productIds.length} existing products.`)
  }

  // Get and delete existing collections
  const { data: collections } = await query.graph({
    entity: "product_collection",
    fields: ["id"],
  })
  const collectionIds = collections.map((c) => c.id)
  if (collectionIds.length > 0) {
    await productModuleService.deleteProductCollections(collectionIds)
    logger.info(`Deleted ${collectionIds.length} existing collections.`)
  }

  // Get and delete existing categories
  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id"],
  })
  const categoryIds = categories.map((c) => c.id)
  if (categoryIds.length > 0) {
    await productModuleService.deleteProductCategories(categoryIds)
    logger.info(`Deleted ${categoryIds.length} existing categories.`)
  }

  // Get and delete existing inventory items to avoid SKU conflicts
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  })
  const inventoryItemIds = inventoryItems.map((i) => i.id)
  if (inventoryItemIds.length > 0) {
    await inventoryModuleService.deleteInventoryItems(inventoryItemIds)
    logger.info(`Deleted ${inventoryItemIds.length} existing inventory items.`)
  }

  // ─── Collections ─────────────────────────────────────────────────────
  logger.info("Creating collections...")
  const { result: collectionsResult } = await createCollectionsWorkflow(container).run({
    input: {
      collections: [
        {
          title: "Öne Çıkan Deprem Malzemeleri",
          handle: "featured",
        },
        {
          title: "Yeni Gelenler",
          handle: "yeni-gelenler",
        },
      ],
    },
  })
  const featuredCollection = collectionsResult[0]
  const newArrivalsCollection = collectionsResult[1]

  // ─── Categories ──────────────────────────────────────────────────────
  logger.info("Creating earthquake categories...")
  const { result: categoryResult } = await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: [
        { name: "Deprem Çantaları & Setleri", is_active: true },
        { name: "İlk Yardım Malzemeleri", is_active: true },
        { name: "Aydınlatma & Enerji", is_active: true },
        { name: "Yiyecek & İçecek", is_active: true },
        { name: "Isınma & Barınma", is_active: true },
        { name: "Güvenlik & İletişim", is_active: true },
      ],
    },
  })

  const catId = (name: string) => categoryResult.find((c) => c.name === name)!.id

  logger.info("Finished creating categories. Seeding products...")

  // Get shipping profile ID
  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfileResult[0]

  // Helper to generate TRY/USD/EUR prices (in cents)
  const prices = (tryAmount: number) => [
    { amount: tryAmount * 100, currency_code: "try" },
    { amount: Math.round((tryAmount / 34) * 100), currency_code: "usd" },
    { amount: Math.round((tryAmount / 37) * 100), currency_code: "eur" },
  ]

  // Get default sales channel
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  })
  const defaultSalesChannel = salesChannels[0]

  // Map our 40 products to Medusa format
  const productsToCreate = PRODUCT_LIST.map((item, index) => {
    // Determine status (draft for 1st, 9th, 17th etc. - index % 8 === 0)
    const status = index % 8 === 0 ? ProductStatus.DRAFT : ProductStatus.PUBLISHED

    // Determine collection: alternate featured / newArrivals
    const collection_id = index % 2 === 0 ? featuredCollection.id : newArrivalsCollection.id

    // Slug handle
    const handle = item.title
      .toLowerCase()
      .replace(/[çğıöşüÇĞİÖŞÜ]/g, (m) => ({ 'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','Ç':'c','Ğ':'g','İ':'i','Ö':'o','Ş':'s','Ü':'u' } as any)[m])
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, '-')

    return {
      title: item.title,
      category_ids: [catId(item.category)],
      collection_id,
      description: item.desc,
      handle,
      weight: item.weight,
      status,
      shipping_profile_id: shippingProfile.id,
      thumbnail: item.thumbnail,
      images: [{ url: item.thumbnail }],
      options: [{ title: "Model", values: ["Standart"] }],
      variants: [
        {
          title: "Standart",
          sku: item.sku,
          barcode: `868400877${9000 + index}`,
          options: { Model: "Standart" },
          manage_inventory: true,
          prices: prices(item.price),
        }
      ],
      sales_channels: defaultSalesChannel ? [{ id: defaultSalesChannel.id }] : [],
    }
  })

  // Batch products creation
  await createProductsWorkflow(container).run({
    input: {
      products: productsToCreate,
    },
  })

  logger.info(`Successfully seeded exactly ${productsToCreate.length} earthquake preparedness products!`)
}
