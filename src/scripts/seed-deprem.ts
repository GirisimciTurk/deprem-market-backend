import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows"

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

  // ─── Products ────────────────────────────────────────────────────────
  const productsToCreate = [
    // 1. Profesyonel 4 Kişilik Deprem Çantası
    {
      title: "Profesyonel Deprem Çantası (4 Kişilik - 72 Saat)",
      category_ids: [catId("Deprem Çantaları & Setleri")],
      collection_id: featuredCollection.id,
      description:
        "AFAD standartlarına uygun, 4 kişilik aileniz için 72 saatlik yaşam desteği sağlayan profesyonel deprem çantası. İçeriğinde: su arıtma tableti (50 adet), enerji barları (12 adet), ilk yardım seti (72 parça), el feneri, düdük, termal battaniye (4 adet), çok amaçlı bıçak, su geçirmez kibrit, pilli radyo, toz maskesi (8 adet), eldiven (4 çift), ip (15m), plastik örtü ve hijyen seti bulunmaktadır. 40L su geçirmez sırt çantası ile teslim edilir.",
      handle: "profesyonel-deprem-cantasi-4-kisilik",
      weight: 5200,
      material: "1000D Cordura Naylon",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      metadata: { free_shipping: true },
      thumbnail: "https://images.unsplash.com/photo-1609587312208-cea54be969e7?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1609587312208-cea54be969e7?auto=format&fit=crop&q=80&w=800" },
        { url: "https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Renk", values: ["Kırmızı", "Siyah"] }],
      variants: [
        {
          title: "Kırmızı",
          sku: "DEP-PRO-4P-RD",
          barcode: "8684008777101",
          options: { Renk: "Kırmızı" },
          manage_inventory: false,
          prices: prices(3499),
        },
        {
          title: "Siyah",
          sku: "DEP-PRO-4P-BK",
          barcode: "8684008777102",
          options: { Renk: "Siyah" },
          manage_inventory: false,
          prices: prices(3499),
        },
      ],
    },

    // 2. Bireysel Deprem Çantası (1 Kişilik)
    {
      title: "Bireysel Deprem Çantası (1 Kişilik)",
      category_ids: [catId("Deprem Çantaları & Setleri")],
      collection_id: featuredCollection.id,
      description:
        "Ofis, araç veya ev için ideal kompakt deprem çantası. İçerisinde: ilk yardım kiti (32 parça), LED fener, düdük, termal battaniye, enerji barı (3 adet), 1L su, toz maskesi (2 adet), eldiven, yağmurluk ve hijyen mendili yer alır. 15L su geçirmez çanta ile teslim edilir.",
      handle: "bireysel-deprem-cantasi",
      weight: 2100,
      material: "600D Polyester",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      metadata: { free_shipping: true },
      thumbnail: "https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Renk", values: ["Kırmızı", "Turuncu"] }],
      variants: [
        {
          title: "Kırmızı",
          sku: "DEP-BIR-1P-RD",
          barcode: "8684008777201",
          options: { Renk: "Kırmızı" },
          manage_inventory: false,
          prices: prices(1499),
        },
        {
          title: "Turuncu",
          sku: "DEP-BIR-1P-OR",
          barcode: "8684008777202",
          options: { Renk: "Turuncu" },
          manage_inventory: false,
          prices: prices(1499),
        },
      ],
    },

    // 3. İlk Yardım Çantası - 120 Parça
    {
      title: "Kapsamlı İlk Yardım Çantası (120 Parça)",
      category_ids: [catId("İlk Yardım Malzemeleri")],
      collection_id: featuredCollection.id,
      description:
        "120 parçalık profesyonel ilk yardım seti. Sargı bezleri, yara bantları, antiseptik mendiller, makas, cımbız, buz kompresi, turnike, göz yıkama solüsyonu, ateller, elastik bandaj ve acil durum battaniyesi içerir. TSE onaylı, fermuarlı su geçirmez çanta ile teslim edilir.",
      handle: "kapsamli-ilk-yardim-cantasi-120",
      weight: 980,
      material: "Oxford Kumaş",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      metadata: { free_shipping: true },
      thumbnail: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Boyut", values: ["Standart", "Büyük"] }],
      variants: [
        {
          title: "Standart (120 Parça)",
          sku: "DEP-IYK-120-STD",
          barcode: "8684008777301",
          options: { Boyut: "Standart" },
          manage_inventory: false,
          prices: prices(849),
        },
        {
          title: "Büyük (200 Parça)",
          sku: "DEP-IYK-200-LRG",
          barcode: "8684008777302",
          options: { Boyut: "Büyük" },
          manage_inventory: false,
          prices: prices(1299),
        },
      ],
    },

    // 4. Güneş Enerjili Şarj Edilebilir Fener & Radyo
    {
      title: "Güneş Enerjili Acil Durum Feneri & Radyo",
      category_ids: [catId("Aydınlatma & Enerji")],
      collection_id: featuredCollection.id,
      description:
        "3'ü 1 arada acil durum cihazı: Güneş paneli + dinamolu el kurması + USB şarj ile çalışan LED fener, FM/AM radyo ve 2000mAh powerbank. SOS alarm sinyali özelliği ile hem aydınlatma hem iletişim hem de cihaz şarjı ihtiyacınızı karşılar. IPX4 su geçirmez, 48 saat kesintisiz fener kullanımı.",
      handle: "gunes-enerjili-fener-radyo",
      weight: 380,
      material: "ABS Plastik",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      thumbnail: "https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Renk", values: ["Turuncu", "Yeşil"] }],
      variants: [
        {
          title: "Turuncu",
          sku: "DEP-FEN-RAD-OR",
          barcode: "8684008777401",
          options: { Renk: "Turuncu" },
          manage_inventory: false,
          prices: prices(599),
        },
        {
          title: "Yeşil",
          sku: "DEP-FEN-RAD-GR",
          barcode: "8684008777402",
          options: { Renk: "Yeşil" },
          manage_inventory: false,
          prices: prices(599),
        },
      ],
    },

    // 5. Termal Acil Durum Battaniyesi (5'li Paket)
    {
      title: "Termal Acil Durum Battaniyesi (5'li Paket)",
      category_ids: [catId("Isınma & Barınma")],
      collection_id: newArrivalsCollection.id,
      description:
        "Mylar uzay battaniyesi teknolojisi ile vücut ısısının %90'ını koruyan acil durum termal battaniyesi. Boyut: 210x160cm. Su geçirmez, rüzgar geçirmez ve gözyaşına dayanıklı. Açılmış hali sığınak olarak da kullanılabilir. Her biri bireysel vakumlu paketlenmiştir. 5 adet paket halinde gönderilir.",
      handle: "termal-acil-durum-battaniyesi-5li",
      weight: 450,
      material: "Mylar Alüminyum Film",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      thumbnail: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Renk", values: ["Gümüş", "Altın"] }],
      variants: [
        {
          title: "Gümüş",
          sku: "DEP-BTN-TRM-SLV",
          barcode: "8684008777501",
          options: { Renk: "Gümüş" },
          manage_inventory: false,
          prices: prices(249),
        },
        {
          title: "Altın",
          sku: "DEP-BTN-TRM-GLD",
          barcode: "8684008777502",
          options: { Renk: "Altın" },
          manage_inventory: false,
          prices: prices(249),
        },
      ],
    },

    // 6. Acil Durum Su Filtresi
    {
      title: "Taşınabilir Acil Durum Su Filtresi",
      category_ids: [catId("Yiyecek & İçecek")],
      collection_id: newArrivalsCollection.id,
      description:
        "0.01 mikron filtrasyon teknolojisi ile bakteri ve parazitlerin %99.99999'unu filtreleyen kişisel su filtresi. 4000 litreye kadar su arıtma kapasitesi. Göl, nehir veya birikmiş yağmur suyunu güvenle içilebilir hale getirir. Pipet tipi kullanım veya su şişesine takılabilir adaptör ile gelir. Ağırlık: sadece 65g.",
      handle: "tasinabilir-su-filtresi",
      weight: 65,
      material: "Hollow Fiber Membran",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      thumbnail: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Model", values: ["Pipet Tipi", "Şişe Adaptörlü"] }],
      variants: [
        {
          title: "Pipet Tipi",
          sku: "DEP-SU-FLT-PIP",
          barcode: "8684008777601",
          options: { Model: "Pipet Tipi" },
          manage_inventory: false,
          prices: prices(399),
        },
        {
          title: "Şişe Adaptörlü",
          sku: "DEP-SU-FLT-ADP",
          barcode: "8684008777602",
          options: { Model: "Şişe Adaptörlü" },
          manage_inventory: false,
          prices: prices(499),
        },
      ],
    },

    // 7. Acil Durum Düdüğü (3'lü Paket)
    {
      title: "Profesyonel Acil Durum Düdüğü (3'lü Paket)",
      category_ids: [catId("Güvenlik & İletişim")],
      collection_id: featuredCollection.id,
      description:
        "120 desibel ses gücü ile enkaz altından bile duyulabilen alüminyum alaşım acil durum düdüğü. Her düdüğe boyun askısı ve anahtarlık halkası dahildir. Paslanmaz çelik, ağızsız tasarım (elleriniz serbest kalır). Çocuklar, yaşlılar ve tüm aile bireyleri için idealdir. 3 adet paket halinde gönderilir.",
      handle: "acil-durum-dudugu-3lu",
      weight: 90,
      material: "Alüminyum Alaşım",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      thumbnail: "https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1516475429286-465d815a0df7?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Renk", values: ["Turuncu", "Siyah"] }],
      variants: [
        {
          title: "Turuncu",
          sku: "DEP-DUD-ALU-OR",
          barcode: "8684008777701",
          options: { Renk: "Turuncu" },
          manage_inventory: false,
          prices: prices(149),
        },
        {
          title: "Siyah",
          sku: "DEP-DUD-ALU-BK",
          barcode: "8684008777702",
          options: { Renk: "Siyah" },
          manage_inventory: false,
          prices: prices(149),
        },
      ],
    },

    // 8. Acil Durum Enerji Barı Seti (24'lü)
    {
      title: "Uzun Ömürlü Acil Durum Enerji Barı (24'lü Kutu)",
      category_ids: [catId("Yiyecek & İçecek")],
      collection_id: newArrivalsCollection.id,
      description:
        "5 yıl raf ömrüne sahip, yüksek kalorili (400 kcal/adet) acil durum beslenme barı. Her barda karbonhidrat, protein ve temel vitaminler dengeli şekilde bulunur. Vakumlu ambalajda, sıcağa ve soğuğa dayanıklı. Çikolata, fıstık ezmesi ve meyveli çeşitleri karışık paketlenmiştir. 24 adet kutu ile gönderilir.",
      handle: "acil-durum-enerji-bari-24lu",
      weight: 2400,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      thumbnail: "https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Çeşit", values: ["Karışık", "Çikolatalı"] }],
      variants: [
        {
          title: "Karışık (24 adet)",
          sku: "DEP-ENR-BAR-MIX",
          barcode: "8684008777801",
          options: { Çeşit: "Karışık" },
          manage_inventory: false,
          prices: prices(649),
        },
        {
          title: "Çikolatalı (24 adet)",
          sku: "DEP-ENR-BAR-CHO",
          barcode: "8684008777802",
          options: { Çeşit: "Çikolatalı" },
          manage_inventory: false,
          prices: prices(649),
        },
      ],
    },

    // 9. 10000mAh Güneş Enerjili Powerbank
    {
      title: "Güneş Enerjili Powerbank (10000mAh) - IP67",
      category_ids: [catId("Aydınlatma & Enerji")],
      collection_id: newArrivalsCollection.id,
      description:
        "IP67 su ve toz geçirmez, şoka dayanıklı güneş enerjili taşınabilir şarj cihazı. 10000mAh kapasitesi ile telefonu 3 kez tam şarj eder. Çift USB çıkışı, LED fener modu (3 kademe + SOS), pusula ve carabiner kancası ile outdoor ve acil durumlara hazır. 1.5W güneş paneli ile kesintisiz enerji.",
      handle: "gunes-enerjili-powerbank-10000",
      weight: 320,
      material: "Silikon + ABS",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      thumbnail: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Renk", values: ["Turuncu", "Haki Yeşil"] }],
      variants: [
        {
          title: "Turuncu",
          sku: "DEP-PWB-SOL-OR",
          barcode: "8684008777901",
          options: { Renk: "Turuncu" },
          manage_inventory: false,
          prices: prices(449),
        },
        {
          title: "Haki Yeşil",
          sku: "DEP-PWB-SOL-GR",
          barcode: "8684008777902",
          options: { Renk: "Haki Yeşil" },
          manage_inventory: false,
          prices: prices(449),
        },
      ],
    },

    // 10. Katlanır Acil Durum Çadırı (2 Kişilik)
    {
      title: "Katlanır Acil Durum Çadırı (2 Kişilik)",
      category_ids: [catId("Isınma & Barınma")],
      collection_id: featuredCollection.id,
      description:
        "Ultralight, 30 saniyede açılabilen pop-up acil durum çadırı. 2 kişilik kapasite, 3 mevsim kullanıma uygun. Su geçirmez PU 3000mm kaplama, UV koruma ve havalandırma sistemi. Katlandığında 60cm çapında disk formuna girer, taşıma çantası dahildir. Rüzgâr dirençli fiberglas çerçeve.",
      handle: "katlanir-acil-durum-cadiri",
      weight: 1800,
      material: "190T Polyester + Fiberglas",
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      metadata: { free_shipping: true },
      thumbnail: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800",
      images: [
        { url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&q=80&w=800" },
      ],
      options: [{ title: "Renk", values: ["Turuncu", "Yeşil"] }],
      variants: [
        {
          title: "Turuncu",
          sku: "DEP-CAD-2P-OR",
          barcode: "8684008778001",
          options: { Renk: "Turuncu" },
          manage_inventory: false,
          prices: prices(1199),
        },
        {
          title: "Yeşil",
          sku: "DEP-CAD-2P-GR",
          barcode: "8684008778002",
          options: { Renk: "Yeşil" },
          manage_inventory: false,
          prices: prices(1199),
        },
      ],
    },
  ]

  await createProductsWorkflow(container).run({
    input: {
      products: productsToCreate,
    },
  })

  logger.info("Successfully seeded 10 earthquake preparedness products across 6 categories!")
}
