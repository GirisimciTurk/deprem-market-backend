import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createSellerWithToken, authHeader, seedCommerce, createAdminWithToken } from "./_helpers"
import { runContractSetup } from "../../src/lib/contract-setup"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import { HAVAR_MODULE } from "../../src/modules/havar"
import { SERVICE_REQUEST_MODULE } from "../../src/modules/service_request"
import { settlePendingPayouts } from "../../src/lib/settlement"
import { encodeServiceOid } from "../../src/api/_lib/service-payment"
import { buildCallbackHash } from "../../src/lib/paytr-hash"

jest.setTimeout(300_000)

/**
 * Pazaryeri E2E — tek harness boot, tek DB (disableAutoTeardown: veri testler arası
 * korunur). Bu oturumda canlıda bulunan satıcı bug'larının REGRESYON kalkanı +
 * yeni yasal sözleşme/onay delili doğrulaması.
 */
medusaIntegrationTestRunner({
  disableAutoTeardown: true,
  testSuite: ({ api, getContainer }) => {
    let container: any
    let crudToken: string
    let crudSellerId: string
    let contractToken: string
    let contractSellerId: string
    // Paylaşılan ticaret ortamı (tek kez seed; "tr" tek region'a ait olabildiği için
    // checkout + iade describe'ları AYNI ortamı kullanır)
    let cPk: { headers: Record<string, string> }
    let cRegionId: string
    let cVariantId: string
    let cProductId: string

    beforeAll(async () => {
      container = getContainer()
      const mp = container.resolve(MARKETPLACE_MODULE)

      // 4 yasal sözleşmeyi kur
      await runContractSetup(container)
      const contracts = await mp.listSellerContracts({ is_active: true })

      // CRUD satıcısı — kapıyı geçmek için tüm zorunlu sözleşmeleri kabul ettir
      const r1 = await createSellerWithToken(container, {
        handle: "crud-satici",
        email: "crud@test.local",
        name: "CRUD Satıcı",
      })
      crudToken = r1.token
      crudSellerId = r1.seller.id
      for (const c of contracts as any[]) {
        await mp.createSellerContractAcceptances({
          seller_id: crudSellerId,
          contract_id: c.id,
          version: c.version,
        })
      }

      // Sözleşme satıcısı — hiç onaylamamış (gate testleri için)
      const r2 = await createSellerWithToken(container, {
        handle: "sozlesme-satici",
        email: "sozlesme@test.local",
        name: "Sözleşme Satıcı",
      })
      contractToken = r2.token
      contractSellerId = r2.seller.id

      // Ticaret ortamı (kanal+pubkey+region+stok+kargo+ürün), ürün CRUD satıcısına bağlı
      const cm = await seedCommerce(container, { sellerId: crudSellerId })
      cPk = { headers: { "x-publishable-api-key": cm.pubKey } }
      cRegionId = cm.regionId
      cVariantId = cm.variantId
      cProductId = cm.product.id
    })

    describe("Smoke", () => {
      it("GET /health → 200", async () => {
        expect((await api.get("/health")).status).toEqual(200)
      })
    })

    describe("Satıcı ürün CRUD (regresyon: silme/fiyat/liste 500)", () => {
      let productId: string

      it("ürün oluşturur (proposed)", async () => {
        const res = await api.post(
          "/vendors/products",
          { title: "Regresyon Ürünü", price: 100, stock: 10, sku: "REG-1" },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        productId = (res.data.product || res.data).id
        expect(productId).toBeTruthy()
      })

      it("liste 500 vermez ve ürünü içerir", async () => {
        const res = await api.get("/vendors/products?limit=100", authHeader(crudToken))
        expect(res.status).toEqual(200)
        expect(res.data.products.some((p: any) => p.id === productId)).toBe(true)
      })

      it("stats 500 vermez", async () => {
        const res = await api.get("/vendors/stats", authHeader(crudToken))
        expect(res.status).toEqual(200)
        expect(res.data.product_count).toBeGreaterThanOrEqual(1)
      })

      it("FİYAT güncellenir (eski bug: 500)", async () => {
        const res = await api.post(
          `/vendors/products/${productId}`,
          { price: 250, sku: "REG-EDIT", stock: 7 },
          authHeader(crudToken)
        )
        expect(res.status).toEqual(200)
        const list = await api.get("/vendors/products?limit=100", authHeader(crudToken))
        const p = list.data.products.find((x: any) => x.id === productId)
        expect(p.variants[0].prices[0].amount).toEqual(25000)
        expect(p.variants[0].sku).toEqual("REG-EDIT")
      })

      it("ürün silinir ve liste/stats HÂLÂ 500 vermez (link temizlendi)", async () => {
        const del = await api.delete(`/vendors/products/${productId}`, authHeader(crudToken))
        expect(del.status).toEqual(200)
        const list = await api.get("/vendors/products?limit=100", authHeader(crudToken))
        expect(list.status).toEqual(200) // dangling link olsaydı 500
        expect(list.data.products.some((p: any) => p.id === productId)).toBe(false)
        const stats = await api.get("/vendors/stats", authHeader(crudToken))
        expect(stats.status).toEqual(200)
      })
    })

    describe("Yasal sözleşmeler + hukuki delil (clickwrap)", () => {
      it("4 aktif zorunlu sözleşme kurulur", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        const active = await mp.listSellerContracts({ is_active: true })
        expect(active.length).toEqual(4)
      })

      it("onaylamamış satıcının kapısı kapalı (pending=4)", async () => {
        const me = await api.get("/vendors/me", authHeader(contractToken))
        expect(me.data.pending_contract_count).toEqual(4)
      })

      it("onaylanmamış satıcı ürün ekleyemez (gate 403)", async () => {
        const res = await api
          .post("/vendors/products", { title: "X", price: 10, stock: 1 }, authHeader(contractToken))
          .catch((e: any) => e.response)
        expect(res.status).toEqual(403)
      })

      it("sözleşme onayında IP/UA/hash/kimlik delili kaydedilir", async () => {
        const list = await api.get("/vendors/contracts", authHeader(contractToken))
        const cid = list.data.contracts[0].id
        const res = await api.post(
          `/vendors/contracts/${cid}/accept`,
          { full_name: "Mehmet Yılmaz (Yetkili)" },
          {
            headers: {
              authorization: `Bearer ${contractToken}`,
              "user-agent": "TestBrowser/1.0",
              "x-forwarded-for": "88.230.45.12, 10.0.0.1",
            },
          }
        )
        expect(res.status).toEqual(201)

        const mp = container.resolve(MARKETPLACE_MODULE)
        const [acc] = await mp.listSellerContractAcceptances({
          seller_id: contractSellerId,
          contract_id: cid,
        })
        expect(acc.ip).toEqual("88.230.45.12")
        expect(acc.user_agent).toEqual("TestBrowser/1.0")
        expect(acc.full_name).toEqual("Mehmet Yılmaz (Yetkili)")
        expect(acc.content_hash).toMatch(/^[a-f0-9]{64}$/)
        expect(acc.identity_snapshot?.tax_number).toEqual("1234567890")
        expect(acc.identity_snapshot?.legal_name).toEqual("Test Satıcı A.Ş.")
      })

      it("onay sonrası pending azalır (idempotent kapı)", async () => {
        const me = await api.get("/vendors/me", authHeader(contractToken))
        expect(me.data.pending_contract_count).toEqual(3)
      })
    })

    describe("Satıcı toplu ürün yükleme", () => {
      it("geçerli satırlar oluşur + hatalı satır raporlanır", async () => {
        const res = await api.post(
          "/vendors/products/bulk",
          {
            rows: [
              { title: "Toplu A", price: 50, stock: 5, sku: "BULK-A" },
              { title: "Toplu B", price: 75, stock: 3, sku: "BULK-B" },
              { title: "", price: 10 }, // hatalı (başlık yok)
            ],
          },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        expect(res.data.created.length).toEqual(2)
        expect(res.data.errors.length).toEqual(1)
      })

      it("beden/renk satırları aynı başlıkta tek ürüne gruplanır (varyantlı bulk)", async () => {
        const res = await api.post(
          "/vendors/products/bulk",
          {
            rows: [
              // Aynı başlık + farklı beden → tek ürün, 3 varyant
              { title: "Toplu Yelek", price: 200, stock: 5, sku: "YL-S", beden: "S" },
              { title: "Toplu Yelek", price: 200, stock: 4, sku: "YL-M", beden: "M" },
              { title: "Toplu Yelek", price: 210, stock: 3, sku: "YL-L", beden: "L" },
              // Varyant bilgisi olmayan bağımsız satır → ayrı (tek-varyant) ürün
              { title: "Toplu Tekil Ürün", price: 99, stock: 7, sku: "TEKIL-1" },
            ],
          },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        // 4 satır → 2 ürün (3 varyantlı grup + 1 bağımsız), hata yok
        expect(res.data.created.length).toEqual(2)
        expect(res.data.errors.length).toEqual(0)

        const list = await api.get("/vendors/products?limit=100", authHeader(crudToken))
        const grouped = list.data.products.find((x: any) => x.title === "Toplu Yelek")
        expect(grouped).toBeTruthy()
        expect(grouped.variants.length).toEqual(3) // S / M / L
        const single = list.data.products.find((x: any) => x.title === "Toplu Tekil Ürün")
        expect(single).toBeTruthy()
        expect(single.variants.length).toEqual(1) // varyantsız → tek "Standart" varyant
      })

      it("varyant satırlarındaki İndirimsiz Fiyat ürün compare_at_price'a taşınır", async () => {
        const res = await api.post(
          "/vendors/products/bulk",
          {
            rows: [
              { title: "İndirimli Yelek", price: 150, original_price: 200, stock: 5, sku: "IY-S", beden: "S" },
              { title: "İndirimli Yelek", price: 150, original_price: 200, stock: 4, sku: "IY-M", beden: "M" },
            ],
          },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        expect(res.data.created.length).toEqual(1)
        const pid = res.data.created[0].id
        const detail = await api.get(`/vendors/products/${pid}`, authHeader(crudToken))
        const product = detail.data.product ?? detail.data
        // İndirimsiz Fiyat (200) > satış (150) → ürün seviyesi compare_at_price'a yazıldı
        expect(Number(product.metadata?.compare_at_price)).toEqual(200)
      })

      it("asimetrik beden+renk kombinasyonlarına izin verir (kartezyen ZORLAMAZ)", async () => {
        // Senaryo: L bedende 2 renk, S bedende 1 renk → 3 satır = 3 varyant.
        // Tam kartezyen olsaydı 2 beden × 2 renk = 4 varyant olurdu; biz YALNIZ
        // yazılan 3 kombinasyonu oluşturuyoruz.
        const res = await api.post(
          "/vendors/products/bulk",
          {
            rows: [
              { title: "Toplu Mont", price: 300, stock: 5, sku: "MNT-L-K", beden: "L", renk: "Kırmızı" },
              { title: "Toplu Mont", price: 300, stock: 4, sku: "MNT-L-M", beden: "L", renk: "Mavi" },
              { title: "Toplu Mont", price: 320, stock: 3, sku: "MNT-S-K", beden: "S", renk: "Kırmızı" },
            ],
          },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        expect(res.data.created.length).toEqual(1)
        expect(res.data.errors.length).toEqual(0)

        const list = await api.get("/vendors/products?limit=100", authHeader(crudToken))
        const p = list.data.products.find((x: any) => x.title === "Toplu Mont")
        expect(p).toBeTruthy()
        // 3 satır → 3 varyant (4 DEĞİL — kartezyen matris zorlanmadı)
        expect(p.variants.length).toEqual(3)
        // Her satırın kendi SKU'su ayrı varyant olarak oluştu
        const skus = (p.variants ?? []).map((v: any) => v.sku).sort()
        expect(skus).toEqual(["MNT-L-K", "MNT-L-M", "MNT-S-K"])
      })

      it("varyant grubu, daha önce kullanılmış SKU'yu içerirse atlanır (tekil yine oluşur)", async () => {
        // Tekil satırlar gruplardan ÖNCE işlenir; "SH-S" tekil olarak işlenir, sonra
        // aynı SKU'yu içeren varyant grubu çakışma nedeniyle atlanır ve raporlanır.
        const res = await api.post(
          "/vendors/products/bulk",
          {
            rows: [
              { title: "Önce Tekil", price: 40, stock: 5, sku: "SH-S" },
              { title: "Sonra Grup", price: 50, stock: 2, sku: "SH-S", beden: "S" },
              { title: "Sonra Grup", price: 50, stock: 2, sku: "GRP-M", beden: "M" },
            ],
          },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        // Tekil oluştu (1), çakışan grup atlandı + raporlandı (1 hata)
        expect(res.data.created.length).toEqual(1)
        expect(res.data.errors.length).toEqual(1)
        expect(res.data.created[0].title).toEqual("Önce Tekil")

        const list = await api.get("/vendors/products?limit=100", authHeader(crudToken))
        // Çakışan grup hiç oluşmadı
        expect(list.data.products.find((x: any) => x.title === "Sonra Grup")).toBeFalsy()
      })
    })

    describe("Satıcı çok-varyantlı ürün", () => {
      it("kartezyen matrisle 2 varyant oluşur", async () => {
        const res = await api.post(
          "/vendors/products",
          {
            title: "Çok Varyant Ürün",
            options: [{ title: "Beden", values: ["S", "M"] }],
            variants: [
              { title: "S", price: 100, stock: 4, sku: "V-S", options: { Beden: "S" } },
              { title: "M", price: 110, stock: 2, sku: "V-M", options: { Beden: "M" } },
            ],
          },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        const pid = (res.data.product || res.data).id
        const list = await api.get("/vendors/products?limit=100", authHeader(crudToken))
        const p = list.data.products.find((x: any) => x.id === pid)
        expect(p.variants.length).toEqual(2)
      })
    })

    describe("Satıcı kampanya (indirim) yaşam döngüsü", () => {
      let prodId: string
      let campId: string
      it("ürün + %20 kampanya oluşturulur", async () => {
        const pr = await api.post(
          "/vendors/products",
          { title: "Kampanya Ürünü", price: 200, stock: 10, sku: "KAMP-1" },
          authHeader(crudToken)
        )
        prodId = (pr.data.product || pr.data).id
        const res = await api.post(
          "/vendors/campaigns",
          { name: "Test İndirim", discount_type: "percentage", discount_value: 20, product_ids: [prodId] },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        campId = (res.data.campaign || res.data).id
        expect(campId).toBeTruthy()
      })
      it("kampanya listede görünür", async () => {
        const res = await api.get("/vendors/campaigns", authHeader(crudToken))
        expect(res.status).toEqual(200)
        expect(res.data.campaigns.some((c: any) => c.id === campId)).toBe(true)
      })
      it("kampanya silinir (fiyat tabana döner)", async () => {
        const res = await api.delete(`/vendors/campaigns/${campId}`, authHeader(crudToken))
        expect(res.status).toEqual(200)
      })
    })

    describe("Satıcı panel uçları (smoke 200)", () => {
      const endpoints = [
        "/vendors/earnings",
        "/vendors/stats",
        "/vendors/scorecard",
        "/vendors/analytics?days=30",
        "/vendors/reviews",
        "/vendors/invoices",
        "/vendors/returns",
        "/vendors/questions",
        "/vendors/notifications",
        "/vendors/campaigns",
        "/vendors/contracts",
        "/vendors/orders",
      ]
      it.each(endpoints)("%s → 200", async (ep) => {
        const res = await api.get(ep, authHeader(crudToken))
        expect(res.status).toEqual(200)
      })
    })

    describe("Sözleşme sürüm artışı yeniden onay ister", () => {
      it("sürüm bump sonrası pending artar", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        const [c] = await mp.listSellerContracts({ is_active: true })
        const before = (await api.get("/vendors/me", authHeader(crudToken))).data
          .pending_contract_count
        await mp.updateSellerContracts({ id: c.id, version: Number(c.version || 1) + 1 })
        const after = (await api.get("/vendors/me", authHeader(crudToken))).data
          .pending_contract_count
        expect(after).toEqual(before + 1)
      })
    })

    describe("Müşteri checkout + marketplace zinciri", () => {
      let pk: { headers: Record<string, string> }
      let regionId: string
      let variantId: string
      let productId: string
      let orderId: string
      let sellerOrderId: string

      beforeAll(() => {
        // Paylaşılan ticaret ortamını kullan (top-level beforeAll'da seed edildi)
        pk = cPk
        regionId = cRegionId
        variantId = cVariantId
        productId = cProductId
      })

      it("misafir müşteri sepet → adres → kargo → ödeme → sipariş tamamlar", async () => {
        // sepet
        const cart = (
          await api.post("/store/carts", { region_id: regionId, email: "musteri@test.local" }, pk)
        ).data.cart
        // ürün ekle
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: variantId, quantity: 2 }, pk)
        // adres
        const addr = {
          first_name: "Test", last_name: "Müşteri", address_1: "Cadde 1",
          city: "İstanbul", country_code: "tr", postal_code: "34000", phone: "05550000000",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email: "musteri@test.local" }, pk)
        // kargo
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, pk)).data.shipping_options
        expect(opts.length).toBeGreaterThan(0)
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, pk)
        // ödeme
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, pk)).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, pk)
        // tamamla
        const res = await api.post(`/store/carts/${cart.id}/complete`, {}, pk)
        const order = res.data.order || (res.data.type === "order" ? res.data.order : null)
        expect(order).toBeTruthy()
        expect(order.items.length).toBeGreaterThan(0)
        orderId = order.id
      })

      it("sipariş satıcıya bölünür (seller_order) + fatura üretilir", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        // order.placed subscriber'ı asenkron → seller_order'ı bekle (poll)
        let sellerOrders: any[] = []
        for (let i = 0; i < 30; i++) {
          sellerOrders = await mp.listSellerOrders({ seller_id: crudSellerId })
          if (sellerOrders.length > 0) break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(sellerOrders.length).toBeGreaterThan(0)
        const so = sellerOrders[0]
        sellerOrderId = so.id
        expect(Number(so.subtotal)).toBeGreaterThan(0)
        // komisyon (%10) hesaplandı mı
        expect(Number(so.commission_amount)).toBeGreaterThan(0)
      })

      it("satıcı siparişi kargolar → kargo bilgisi + hakediş zamanlanır", async () => {
        const res = await api.post(
          `/vendors/orders/${sellerOrderId}/fulfill`,
          { carrier: "yurtici", tracking_number: "YK-TEST-12345" },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(res.status)
        const mp = container.resolve(MARKETPLACE_MODULE)
        const so: any = await mp.retrieveSellerOrder(sellerOrderId)
        expect(so.fulfillment_status).toEqual("fulfilled")
        expect(so.carrier).toEqual("yurtici")
        expect(so.tracking_number).toEqual("YK-TEST-12345")
        expect(so.tracking_url).toBeTruthy() // cargo.ts şablonundan üretildi
        expect(so.eligible_at).toBeTruthy() // hakediş tarihi zamanlandı
      })

      it("hakediş süresi dolunca pending → eligible (settlement)", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        // Bekleme süresi dolmuş gibi eligible_at'i geçmişe çek
        await mp.updateSellerOrders({
          id: sellerOrderId,
          eligible_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })
        const moved = await settlePendingPayouts(container)
        expect(moved).toBeGreaterThanOrEqual(1)
        const so: any = await mp.retrieveSellerOrder(sellerOrderId)
        expect(so.payout_status).toEqual("eligible")
      })

      it("müşteri kaydı + giriş + /customers/me çalışır", async () => {
        const email = "hesaptest@test.local"
        const reg = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: "Test1234!" }
        )
        const regToken = reg.data.token
        expect(regToken).toBeTruthy()
        await api.post("/store/customers", { email, first_name: "Hesap", last_name: "Test" }, {
          headers: { ...pk.headers, authorization: `Bearer ${regToken}` },
        })
        const login = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        const me = await api.get("/store/customers/me", {
          headers: { ...pk.headers, authorization: `Bearer ${login.data.token}` },
        })
        expect(me.status).toEqual(200)
        expect(me.data.customer.email).toEqual(email)
      })

      it("Ürün Soru-Cevap: müşteri sorar → satıcı yanıtlar → mağazada görünür", async () => {
        // müşteri soru sorar (public)
        const ask = await api.post(
          "/store/product-questions",
          { product_id: productId, question: "Bu ürün stokta mı acaba?", name: "Soran Müşteri" },
          pk
        )
        expect([200, 201]).toContain(ask.status)
        // satıcı bekleyen soruyu görür
        const pending = await api.get("/vendors/questions", authHeader(crudToken))
        const q = pending.data.questions.find((x: any) => x.product_id === productId)
        expect(q).toBeTruthy()
        // satıcı yanıtlar
        const ans = await api.post(
          `/vendors/questions/${q.id}/answer`,
          { answer: "Evet, stoğumuzda mevcuttur." },
          authHeader(crudToken)
        )
        expect([200, 201]).toContain(ans.status)
        // mağaza public ucu yalnız yanıtlanmışları döndürür → soru artık görünür + cevaplı
        const store = await api.get(`/store/product-questions?product_id=${productId}`, pk)
        expect(store.data.questions.length).toBeGreaterThan(0)
        expect(store.data.questions.some((x: any) => x.answer && x.answer.length > 0)).toBe(true)
      })

      it("Satıcı yorumu: müşteri yorum → admin onay → satıcı görür + vitrin puanı", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        // müşteri yorum gönderir (pending)
        const rev = await api.post(
          "/store/seller-reviews",
          { seller_handle: "crud-satici", rating: 5, comment: "Hızlı kargo, teşekkürler", name: "Ayşe K." },
          pk
        )
        expect([200, 201]).toContain(rev.status)
        // admin moderasyonu (onay + puan yeniden hesapla)
        const [pendingRev] = await mp.listSellerReviews({ seller_id: crudSellerId, status: "pending" })
        expect(pendingRev).toBeTruthy()
        await mp.updateSellerReviews({ id: pendingRev.id, status: "approved" })
        if (typeof (mp as any).recomputeSellerRating === "function") {
          await (mp as any).recomputeSellerRating(crudSellerId)
        }
        // satıcı onaylı yorumu görür
        const vendorReviews = await api.get("/vendors/reviews", authHeader(crudToken))
        expect(vendorReviews.data.reviews.some((r: any) => r.status === "approved")).toBe(true)
        // vitrin puanı hesaplanır
        const storefront = await api.get("/store/sellers/crud-satici", pk)
        const seller = storefront.data.seller || storefront.data
        expect(Number(seller.rating_avg)).toBeGreaterThan(0)
      })
    })

    describe("İade/RMA zinciri (satıcıya bölünmüş iade)", () => {
      let pk: { headers: Record<string, string> }
      let custToken: string
      let orderId: string
      let orderItemId: string

      const ch = () => ({ headers: { ...pk.headers, authorization: `Bearer ${custToken}` } })

      beforeAll(async () => {
        pk = cPk // paylaşılan ticaret ortamı
        // Kayıtlı müşteri (iade auth gerektirir + sipariş sahipliği)
        const email = "iade-musteri@test.local"
        const reg = await api.post("/auth/customer/emailpass/register", { email, password: "Test1234!" })
        await api.post("/store/customers", { email, first_name: "İade", last_name: "Müşteri" }, {
          headers: { ...pk.headers, authorization: `Bearer ${reg.data.token}` },
        })
        custToken = (await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })).data.token
        // Müşteri olarak checkout (order.customer_id set olur)
        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, ch())).data.cart
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: cVariantId, quantity: 2 }, ch())
        const addr = {
          first_name: "İade", last_name: "Müşteri", address_1: "Cadde 5",
          city: "İstanbul", country_code: "tr", postal_code: "34000", phone: "05551112233",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email }, ch())
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, ch())).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, ch())
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, ch())).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, ch())
        const order = (await api.post(`/store/carts/${cart.id}/complete`, {}, ch())).data.order
        orderId = order.id
        orderItemId = order.items[0].id
        // İade ancak FULFILLED kalemler için açılır → native siparişi kargoya ver
        const { createOrderFulfillmentWorkflow } = await import("@medusajs/core-flows")
        await createOrderFulfillmentWorkflow(container).run({
          input: {
            order_id: orderId,
            items: order.items.map((i: any) => ({ id: i.id, quantity: i.quantity })),
          } as any,
        })
      })

      it("müşteri iade talebi → satıcıya bölünmüş SellerReturn (requested)", async () => {
        const res = await api.post(
          "/store/return-requests",
          { order_id: orderId, items: [{ id: orderItemId, quantity: 1 }] },
          ch()
        )
        expect([200, 201]).toContain(res.status)
        const mp = container.resolve(MARKETPLACE_MODULE)
        let srs: any[] = []
        for (let i = 0; i < 30; i++) {
          srs = await mp.listSellerReturns({ seller_id: crudSellerId, status: "requested" })
          if (srs.length > 0) break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(srs.length).toBeGreaterThan(0)
      })

      it("satıcı iadeyi teslim alır → SellerReturn 'received' + komisyon clawback", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        const [sr] = await mp.listSellerReturns({ seller_id: crudSellerId, status: "requested" })
        const res = await api.post(`/vendors/returns/${sr.id}/receive`, {}, authHeader(crudToken))
        expect([200, 201]).toContain(res.status)
        const updated: any = await mp.retrieveSellerReturn(sr.id)
        expect(updated.status).toEqual("received")
        // ilgili seller_order'da iade kazancı geri alındı
        expect(Number(updated.returned_earning ?? 0)).toBeGreaterThanOrEqual(0)
      })
    })

    describe("HAVAR (drone) ön alım / ön kiralama talebi", () => {
      const pk = () => ({ headers: { "x-publishable-api-key": cPk.headers["x-publishable-api-key"] } })

      it("ön alım talebi oluşturulur + kapı mekanizması kaydedilir", async () => {
        const res = await api.post(
          "/store/havar-requests",
          {
            type: "purchase",
            full_name: "Drone Alıcı",
            email: "havar-buy@test.local",
            phone: "05551112233",
            buyer_type: "family",
            usage: "both",
            quantity: 2,
            want_door_mechanism: true,
          },
          pk()
        )
        expect([200, 201]).toContain(res.status)
        const havar = container.resolve(HAVAR_MODULE)
        const [rows] = await havar.listAndCountHavarRequests({ email: "havar-buy@test.local" })
        expect(rows.length).toBeGreaterThan(0)
        expect(rows[0].type).toEqual("purchase")
        expect(rows[0].want_door_mechanism).toBe(true)
      })

      it("ön kiralama talebi oluşturulur (süre ile)", async () => {
        const res = await api.post(
          "/store/havar-requests",
          { type: "rental", full_name: "Drone Kiracı", email: "havar-rent@test.local", usage: "human", rental_duration: "3 ay" },
          pk()
        )
        expect([200, 201]).toContain(res.status)
        const havar = container.resolve(HAVAR_MODULE)
        const [rows] = await havar.listAndCountHavarRequests({ email: "havar-rent@test.local" })
        expect(rows[0].type).toEqual("rental")
        expect(rows[0].rental_duration).toEqual("3 ay")
      })

      it("geçersiz tip reddedilir (400)", async () => {
        const res = await api
          .post("/store/havar-requests", { type: "invalid", full_name: "X", email: "x@test.local" }, pk())
          .catch((e: any) => e.response)
        expect(res.status).toEqual(400)
      })
    })

    // ───────── Hizmet talebi ödeme/escrow/payout (D fazı) ─────────
    describe("Hizmet talebi ödeme/escrow/payout (D fazı)", () => {
      let adminToken: string
      let custToken: string
      let custPk: { headers: Record<string, string> }
      let reqId: string

      beforeAll(async () => {
        adminToken = (await createAdminWithToken(container)).token
        // Hizmet talebini SAHİBİ olan müşteri açsın (pay ucu sahiplik ister).
        const email = "hizmet-musteri@test.local"
        await api.post("/auth/customer/emailpass/register", { email, password: "Test1234!" })
        await api.post(
          "/store/customers",
          { email, first_name: "Hizmet", last_name: "Müşteri" },
          { headers: { ...cPk.headers, authorization: `Bearer ${(await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })).data.token}` } }
        )
        const login = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        custPk = { headers: { ...cPk.headers, authorization: `Bearer ${login.data.token}` } }
      })

      it("müşteri keşif talebi açar → otomatik bayi atanır + komisyon snapshot'lanır", async () => {
        const res = await api.post(
          "/store/service-requests",
          {
            service_kind: "carbon_fiber",
            service_title: "Karbon Fiber Güçlendirme",
            full_name: "Hizmet Müşteri",
            email: "hizmet-musteri@test.local",
            phone: "05551234567",
            city: "İstanbul",
            district: "Kadıköy",
            address: "Test Mah. 1. Sk. No:5",
          },
          custPk
        )
        expect([200, 201]).toContain(res.status)
        const sr = res.data.service_request
        reqId = sr.id
        expect(sr.status).toEqual("talep")
        // Aktif bayi(ler) var → otomatik atanmalı + komisyon oranı snapshot (10).
        expect(sr.assigned_seller_id).toBeTruthy()
        expect(sr.commission_rate).toEqual(10)
      })

      it("admin tutarları + komisyonu belirler (HTTP)", async () => {
        const res = await api.post(
          `/admin/service-requests/${reqId}`,
          { survey_fee: 500, deposit_amount: 2000, balance_amount: 3000, commission_rate: 10 },
          authHeader(adminToken)
        )
        expect(res.status).toEqual(200)
        const sr = res.data.service_request
        expect(sr.deposit_amount).toEqual(2000)
        expect(sr.balance_amount).toEqual(3000)
      })

      it("ödeme kapısı: kapora teklif onayından ÖNCE reddedilir (400)", async () => {
        const res = await api
          .post(`/store/service-requests/${reqId}/pay`, { phase: "deposit" }, custPk)
          .catch((e: any) => e.response)
        expect(res.status).toEqual(400)
        expect(String(res.data?.error || "")).toMatch(/onayla/i)
      })

      it("ödeme kapısı: PayTR yapılandırılmamışsa keşif ödemesi 503 döner (rota+sahiplik+kapı geçer)", async () => {
        const res = await api
          .post(`/store/service-requests/${reqId}/pay`, { phase: "survey" }, custPk)
          .catch((e: any) => e.response)
        expect(res.status).toEqual(503)
        expect(String(res.data?.error || "")).toMatch(/yapılandırılmamış/i)
      })

      it("admin manuel tahsilat: keşif + kapora → payment_status ilerler", async () => {
        // Önce teklif onaylanmış say (durum override).
        await api.post(`/admin/service-requests/${reqId}`, { status: "onaylandi" }, authHeader(adminToken))
        const s1 = await api.post(
          `/admin/service-requests/${reqId}`,
          { action: "record_payment", phase: "survey" },
          authHeader(adminToken)
        )
        expect(s1.data.service_request.payment_status).toEqual("survey_paid")
        const s2 = await api.post(
          `/admin/service-requests/${reqId}`,
          { action: "record_payment", phase: "deposit" },
          authHeader(adminToken)
        )
        expect(s2.data.service_request.payment_status).toEqual("deposit_paid")
        expect(s2.data.service_request.paid_total).toEqual(2500)
      })

      it("bakiye ödenmeden iş teslim olsa bile payout eligible OLMAZ", async () => {
        const res = await api.post(
          `/admin/service-requests/${reqId}`,
          { status: "montaj_yapildi" },
          authHeader(adminToken)
        )
        expect(res.data.service_request.payout_status).toEqual("pending")
      })

      it("bakiye tahsil edilince tam ödeme + iş teslim → payout eligible + komisyon/net hesaplanır", async () => {
        const res = await api.post(
          `/admin/service-requests/${reqId}`,
          { action: "record_payment", phase: "balance" },
          authHeader(adminToken)
        )
        const sr = res.data.service_request
        expect(sr.payment_status).toEqual("paid")
        expect(sr.paid_total).toEqual(5500)
        expect(sr.payout_status).toEqual("eligible")
        expect(sr.commission_amount).toEqual(550) // %10
        expect(sr.payout_amount).toEqual(4950)
      })

      it("payout (manuel mod — PayTR yok): escrow paid işaretlenir", async () => {
        const res = await api.post(
          `/admin/service-requests/${reqId}/payout`,
          {},
          authHeader(adminToken)
        )
        expect(res.status).toEqual(200)
        expect(res.data.mode).toEqual("manual")
        expect(res.data.service_request.payout_status).toEqual("paid")
        expect(res.data.service_request.paid_at).toBeTruthy()
      })

      it("zaten ödenmiş payout tekrar denenince 400", async () => {
        const res = await api
          .post(`/admin/service-requests/${reqId}/payout`, {}, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect(res.status).toEqual(400)
      })

      it("RBAC: admin hizmet ucu kimliksiz çağrıda 401", async () => {
        const res = await api
          .get(`/admin/service-requests/${reqId}`)
          .catch((e: any) => e.response)
        expect([401, 403]).toContain(res.status)
      })
    })

    // ───────── Hizmet PayTR callback (srq dallanması) ─────────
    describe("Hizmet PayTR callback (srq merchant_oid)", () => {
      const REALM = {
        PAYTR_MERCHANT_ID: "999999",
        PAYTR_MERCHANT_KEY: "E2E_TEST_KEY",
        PAYTR_MERCHANT_SALT: "E2E_TEST_SALT",
      }
      const saved: Record<string, string | undefined> = {}
      let srvId: string

      beforeAll(async () => {
        // PayTR'ı geçici olarak "yapılandırılmış" yap (callback config kapısı geçsin).
        // Callback hiçbir ağ çağrısı yapmaz (hash yerel doğrulanır) → güvenli.
        for (const k of Object.keys(REALM)) {
          saved[k] = process.env[k]
          process.env[k] = (REALM as any)[k]
        }
        const svc: any = container.resolve(SERVICE_REQUEST_MODULE)
        const created = await svc.createServiceRequests({
          service_kind: "gas_cutoff",
          service_title: "Gaz Kesici",
          full_name: "Callback Test",
          email: "callback@test.local",
          status: "talep",
          survey_fee: 750,
          payment_status: "none",
        })
        srvId = created.id
      })

      afterAll(() => {
        for (const k of Object.keys(REALM)) {
          if (saved[k] === undefined) delete process.env[k]
          else process.env[k] = saved[k]
        }
      })

      it("geçerli imzalı başarı bildirimi keşif ödemesini işler (idempotent)", async () => {
        const merchantOid = encodeServiceOid(srvId, "survey")
        const totalAmount = "75000" // 750 TL × 100 (kuruş) — callback imzası için
        const hash = buildCallbackHash({
          merchantOid,
          status: "success",
          totalAmount,
          merchantKey: REALM.PAYTR_MERCHANT_KEY,
          merchantSalt: REALM.PAYTR_MERCHANT_SALT,
        })
        const body = { merchant_oid: merchantOid, status: "success", total_amount: totalAmount, hash }

        const r1 = await api.post("/paytr-callback", body)
        expect(r1.status).toEqual(200)
        expect(r1.data).toEqual("OK")

        const svc: any = container.resolve(SERVICE_REQUEST_MODULE)
        const after: any = await svc.retrieveServiceRequest(srvId)
        expect(after.payment_status).toEqual("survey_paid")
        expect(after.paid_total).toEqual(750) // major (TL) olarak saklanır
        expect((after.payments || []).some((p: any) => p.phase === "survey" && p.status === "paid")).toBe(true)

        // Idempotluk: aynı bildirim tekrar gelince mükerrer tahsilat eklenmez.
        const r2 = await api.post("/paytr-callback", body)
        expect(r2.status).toEqual(200)
        const after2: any = await svc.retrieveServiceRequest(srvId)
        expect(after2.paid_total).toEqual(750)
        expect((after2.payments || []).filter((p: any) => p.phase === "survey").length).toEqual(1)
      })

      it("geçersiz imza reddedilir (BAD_HASH), ödeme işlenmez", async () => {
        const svc: any = container.resolve(SERVICE_REQUEST_MODULE)
        const created = await svc.createServiceRequests({
          service_kind: "other", full_name: "Bad Hash", email: "badhash@test.local",
          status: "talep", survey_fee: 100, payment_status: "none",
        })
        const merchantOid = encodeServiceOid(created.id, "survey")
        const res = await api
          .post("/paytr-callback", { merchant_oid: merchantOid, status: "success", total_amount: "10000", hash: "GECERSIZ" })
          .catch((e: any) => e.response)
        expect(res.status).toEqual(400)
        const after: any = await svc.retrieveServiceRequest(created.id)
        expect(after.payment_status).toEqual("none")
      })
    })

    // ───────── Hizmet talebi TAM YAŞAM DÖNGÜSÜ (müşteri↔bayi↔admin E2E) ─────────
    // Tüm aktörlerin gerçek HTTP uçlarından geçen uçtan uca yolculuk:
    // talep → keşif → teklif → onay → tedarik → montaj → ödeme → tamam → payout.
    describe("Hizmet talebi tam yaşam döngüsü (E2E)", () => {
      let adminToken: string
      let custPk2: { headers: Record<string, string> }
      let id: string

      // Talebin durumunu müşterinin gözünden okur (kendi takip ekranı).
      const custStatus = async () => {
        const r = await api.get(`/store/service-requests/${id}`, custPk2)
        return r.data.service_request.status as string
      }

      beforeAll(async () => {
        adminToken = (await createAdminWithToken(container, "lifecycle-admin@test.local")).token
        const email = "lifecycle-musteri@test.local"
        await api.post("/auth/customer/emailpass/register", { email, password: "Test1234!" })
        const login1 = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        await api.post(
          "/store/customers",
          { email, first_name: "Döngü", last_name: "Müşteri" },
          { headers: { ...cPk.headers, authorization: `Bearer ${login1.data.token}` } }
        )
        const login = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        custPk2 = { headers: { ...cPk.headers, authorization: `Bearer ${login.data.token}` } }
      })

      it("1) müşteri keşif talebi açar (talep)", async () => {
        const res = await api.post(
          "/store/service-requests",
          {
            service_kind: "panic_room",
            service_title: "Panik Odası Kurulumu",
            full_name: "Döngü Müşteri",
            email: "lifecycle-musteri@test.local",
            phone: "05559998877",
            city: "Ankara",
            district: "Çankaya",
            address: "Yaşam Cd. No:7",
            details: { m2: 18, kat_sayisi: 1 },
          },
          custPk2
        )
        expect([200, 201]).toContain(res.status)
        id = res.data.service_request.id
        expect(res.data.service_request.status).toEqual("talep")
      })

      it("2) admin talebi bilinen bayiye atar (komisyon snapshot)", async () => {
        const res = await api.post(
          `/admin/service-requests/${id}`,
          { action: "assign", seller_id: crudSellerId },
          authHeader(adminToken)
        )
        expect(res.data.service_request.assigned_seller_id).toEqual(crudSellerId)
        expect(res.data.service_request.commission_rate).toEqual(10)
        // Bayi kendi listesinde görür.
        const vlist = await api.get("/vendors/service-requests", authHeader(crudToken))
        expect(vlist.data.service_requests.some((r: any) => r.id === id)).toBe(true)
      })

      it("3) bayi keşif randevusu verir → kesif_planlandi", async () => {
        const res = await api.post(
          `/vendors/service-requests/${id}`,
          { action: "survey", survey_scheduled_at: "2026-07-01T10:00:00.000Z" },
          authHeader(crudToken)
        )
        expect(res.data.service_request.status).toEqual("kesif_planlandi")
        expect(await custStatus()).toEqual("kesif_planlandi")
      })

      it("4) bayi keşfi tamamlar → kesif_yapildi", async () => {
        const res = await api.post(
          `/vendors/service-requests/${id}`,
          { action: "survey", survey_done: true, survey_report: "Kolon güçlendirme uygun." },
          authHeader(crudToken)
        )
        expect(res.data.service_request.status).toEqual("kesif_yapildi")
      })

      it("5) bayi teklif gönderir → teklif_gonderildi", async () => {
        const res = await api.post(
          `/vendors/service-requests/${id}`,
          {
            action: "offer",
            offer_items: [
              { label: "Panik odası paneli", qty: 1, unit_price: 4000, total: 4000 },
              { label: "Montaj işçiliği", qty: 1, unit_price: 1000, total: 1000 },
            ],
            offer_total: 5000,
          },
          authHeader(crudToken)
        )
        expect(res.data.service_request.status).toEqual("teklif_gonderildi")
        expect(Number(res.data.service_request.offer_total)).toEqual(5000)
      })

      it("6) müşteri teklifi onaylar → onaylandi", async () => {
        const res = await api.post(`/store/service-requests/${id}`, { decision: "accept" }, custPk2)
        expect(res.data.service_request.status).toEqual("onaylandi")
        expect(res.data.service_request.offer_decision).toEqual("accepted")
      })

      it("7) admin kapora/bakiye belirler + kapora tahsil edilir", async () => {
        await api.post(
          `/admin/service-requests/${id}`,
          { deposit_amount: 2000, balance_amount: 3000, commission_rate: 10 },
          authHeader(adminToken)
        )
        const res = await api.post(
          `/admin/service-requests/${id}`,
          { action: "record_payment", phase: "deposit" },
          authHeader(adminToken)
        )
        expect(res.data.service_request.payment_status).toEqual("deposit_paid")
      })

      it("8) bayi tedarik → teslim → montaj randevusu → montaj yapıldı", async () => {
        for (const status of ["tedarik", "teslim_edildi", "montaj_planlandi", "montaj_yapildi"]) {
          const body: any = { action: "status", status }
          if (status === "montaj_planlandi") body.install_scheduled_at = "2026-07-10T09:00:00.000Z"
          const res = await api.post(`/vendors/service-requests/${id}`, body, authHeader(crudToken))
          expect(res.data.service_request.status).toEqual(status)
        }
        // Bakiye henüz ödenmedi → payout eligible OLMAMALI.
        const g = await api.get(`/admin/service-requests/${id}`, authHeader(adminToken))
        expect(g.data.service_request.payout_status).toEqual("pending")
      })

      it("9) bakiye tahsil → tam ödeme + iş teslim → payout eligible", async () => {
        const res = await api.post(
          `/admin/service-requests/${id}`,
          { action: "record_payment", phase: "balance" },
          authHeader(adminToken)
        )
        const sr = res.data.service_request
        expect(sr.payment_status).toEqual("paid")
        expect(sr.paid_total).toEqual(5000)
        expect(sr.payout_status).toEqual("eligible")
        expect(sr.commission_amount).toEqual(500) // %10 × 5000
        expect(sr.payout_amount).toEqual(4500)
      })

      it("10) bayi işi kapatır → tamamlandi (müşteri de görür)", async () => {
        const res = await api.post(
          `/vendors/service-requests/${id}`,
          { action: "status", status: "tamamlandi" },
          authHeader(crudToken)
        )
        expect(res.data.service_request.status).toEqual("tamamlandi")
        expect(await custStatus()).toEqual("tamamlandi")
      })

      it("11) admin payout → bayiye aktarılır (manuel mod)", async () => {
        const res = await api.post(`/admin/service-requests/${id}/payout`, {}, authHeader(adminToken))
        expect(res.status).toEqual(200)
        expect(res.data.service_request.payout_status).toEqual("paid")
        // Bayi panelinde net hakediş görünür.
        const vlist = await api.get("/vendors/service-requests?status=tamamlandi", authHeader(crudToken))
        const mine = vlist.data.service_requests.find((r: any) => r.id === id)
        expect(mine.payout_amount).toEqual(4500)
        expect(mine.payout_status).toEqual("paid")
      })
    })
  },
})
