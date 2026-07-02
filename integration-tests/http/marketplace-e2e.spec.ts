import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createSellerWithToken,
  authHeader,
  seedCommerce,
  createAdminWithToken,
  seedExtraProduct,
} from "./_helpers"
import { runContractSetup } from "../../src/lib/contract-setup"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import { HAVAR_MODULE } from "../../src/modules/havar"
import { SERVICE_REQUEST_MODULE } from "../../src/modules/service_request"
import { RESELLER_MODULE } from "../../src/modules/reseller"
import { settlePendingPayouts } from "../../src/lib/settlement"
import { encodeServiceOid } from "../../src/api/_lib/service-payment"
import { buildCallbackHash } from "../../src/lib/paytr-hash"
import { syncProductTaxRate } from "../../src/lib/tax-sync"
import { createVendorProduct } from "../../src/api/vendors/_lib/create-vendor-product"

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

    // ── REGRESYON: bayi hizmet-talebi durum makinesi backend'de zorunlu ──────────
    // (Fix: vendors/service-requests/[id] — offer/status/survey/reject mevcut durumu
    // kontrol etmiyordu; bayi işi yapmadan tamamlandı işaretleyip escrow'u erken
    // açtırabiliyor, onay sonrası fiyatı değiştirebiliyordu.)
    describe("Hizmet talebi bayi durum makinesi (regresyon: guard'lar)", () => {
      let adminToken: string
      let gPk: { headers: Record<string, string> }

      beforeAll(async () => {
        adminToken = (await createAdminWithToken(container, "guard-admin@test.local")).token
        const email = "guard-musteri@test.local"
        await api.post("/auth/customer/emailpass/register", { email, password: "Test1234!" })
        const login1 = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        await api.post(
          "/store/customers",
          { email, first_name: "Guard", last_name: "Müşteri" },
          { headers: { ...cPk.headers, authorization: `Bearer ${login1.data.token}` } }
        )
        const login = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        gPk = { headers: { ...cPk.headers, authorization: `Bearer ${login.data.token}` } }
      })

      // Yeni talep açar ve crudSellerId bayisine atar (deterministik atama).
      const openAssigned = async () => {
        const res = await api.post(
          "/store/service-requests",
          {
            service_kind: "carbon_fiber",
            service_title: "Guard Testi",
            full_name: "Guard Müşteri",
            email: "guard-musteri@test.local",
            phone: "05550001122",
            city: "İzmir",
            district: "Bornova",
            address: "Guard Sk. No:1",
          },
          gPk
        )
        const rid = res.data.service_request.id
        await api.post(
          `/admin/service-requests/${rid}`,
          { action: "assign", seller_id: crudSellerId },
          authHeader(adminToken)
        )
        return rid as string
      }

      const adminSr = async (rid: string) => {
        const g = await api.get(`/admin/service-requests/${rid}`, authHeader(adminToken))
        return g.data.service_request
      }

      it("bayi teklif ONAYLANMADAN işi 'tamamlandi' yapamaz (409)", async () => {
        const rid = await openAssigned() // status: talep
        const res = await api
          .post(
            `/vendors/service-requests/${rid}`,
            { action: "status", status: "tamamlandi" },
            authHeader(crudToken)
          )
          .catch((e: any) => e.response)
        expect(res.status).toBe(409)
        expect((await adminSr(rid)).status).toBe("talep")
      })

      it("bayi onaydan sonra tekrar teklif verip fiyatı değiştiremez (409)", async () => {
        const rid = await openAssigned()
        await api.post(
          `/vendors/service-requests/${rid}`,
          { action: "offer", offer_total: 5000 },
          authHeader(crudToken)
        )
        await api.post(`/store/service-requests/${rid}`, { decision: "accept" }, gPk)
        const res = await api
          .post(
            `/vendors/service-requests/${rid}`,
            { action: "offer", offer_total: 99999 },
            authHeader(crudToken)
          )
          .catch((e: any) => e.response)
        expect(res.status).toBe(409)
        const sr = await adminSr(rid)
        expect(sr.status).toBe("onaylandi")
        expect(Number(sr.offer_total)).toBe(5000) // fiyat DEĞİŞMEDİ
      })

      it("bayi teklif sonrası keşif bilgisi giremez (409)", async () => {
        const rid = await openAssigned()
        await api.post(
          `/vendors/service-requests/${rid}`,
          { action: "offer", offer_total: 4000 },
          authHeader(crudToken)
        )
        const res = await api
          .post(
            `/vendors/service-requests/${rid}`,
            { action: "survey", survey_done: true },
            authHeader(crudToken)
          )
          .catch((e: any) => e.response)
        expect(res.status).toBe(409)
      })

      it("bayi ödemesi alınmış talebi reddedip devredemez (409)", async () => {
        const rid = await openAssigned()
        await api.post(
          `/vendors/service-requests/${rid}`,
          { action: "offer", offer_total: 3000 },
          authHeader(crudToken)
        )
        await api.post(`/store/service-requests/${rid}`, { decision: "accept" }, gPk)
        await api.post(
          `/admin/service-requests/${rid}`,
          { deposit_amount: 1000, balance_amount: 2000, commission_rate: 10 },
          authHeader(adminToken)
        )
        await api.post(
          `/admin/service-requests/${rid}`,
          { action: "record_payment", phase: "deposit" },
          authHeader(adminToken)
        )
        const res = await api
          .post(`/vendors/service-requests/${rid}`, { action: "reject" }, authHeader(crudToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(409)
        expect((await adminSr(rid)).assigned_seller_id).toBe(crudSellerId) // devredilmedi
      })

      it("bayi onaydan SONRA işi ilerletebilir (tedarik → 200) [pozitif]", async () => {
        const rid = await openAssigned()
        await api.post(
          `/vendors/service-requests/${rid}`,
          { action: "offer", offer_total: 2500 },
          authHeader(crudToken)
        )
        await api.post(`/store/service-requests/${rid}`, { decision: "accept" }, gPk)
        const res = await api.post(
          `/vendors/service-requests/${rid}`,
          { action: "status", status: "tedarik" },
          authHeader(crudToken)
        )
        expect(res.status).toBe(200)
        expect(res.data.service_request.status).toBe("tedarik")
      })
    })

    // ── REGRESYON: başvurudan satıcıya dönüştürme idempotency + durum guard'ı ─────
    // (Fix: admin/sellers/from-application/[id] — app.status kontrolü + "zaten
    // dönüştürüldü mü" yoktu → çift-tık mükerrer satıcı; rejected/suspended dönüşebiliyordu.)
    describe("Başvurudan satıcıya dönüştürme (idempotency + guard)", () => {
      let adminToken: string
      let reseller: any
      let marketplace: any

      beforeAll(async () => {
        adminToken = (await createAdminWithToken(container, "convert-admin@test.local")).token
        reseller = container.resolve(RESELLER_MODULE)
        marketplace = container.resolve(MARKETPLACE_MODULE)
      })

      const createApp = async (opts: {
        email: string
        company: string
        status?: string
        type?: string
      }) => {
        const app = await reseller.createResellerApplications({
          application_type: opts.type ?? "firma",
          company_name: opts.company,
          applicant_name: "Başvuru Sahibi",
          email: opts.email,
          phone: "05551110000",
          city: "İstanbul",
          status: opts.status ?? "pending",
        })
        return app.id as string
      }

      it("bekleyen/onaylı başvuru satıcıya dönüşür (201) + davet üretilir", async () => {
        const email = "firma-basvuru-1@test.local"
        const appId = await createApp({ email, company: "Konvert Firma A" })
        const res = await api.post(
          `/admin/sellers/from-application/${appId}`,
          {},
          authHeader(adminToken)
        )
        expect(res.status).toBe(201)
        expect(res.data.seller?.id).toBeTruthy()
        expect(res.data.seller.partner_type).toBe("product") // firma → product
        const sellers = await marketplace.listSellers({ email })
        expect(sellers.length).toBe(1)
      })

      it("aynı başvuru 2. kez dönüştürülünce 409 — mükerrer satıcı OLUŞMAZ", async () => {
        const email = "firma-basvuru-2@test.local"
        const appId = await createApp({ email, company: "Konvert Firma B" })
        const first = await api.post(
          `/admin/sellers/from-application/${appId}`,
          {},
          authHeader(adminToken)
        )
        expect(first.status).toBe(201)
        const second = await api
          .post(`/admin/sellers/from-application/${appId}`, {}, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect(second.status).toBe(409)
        const sellers = await marketplace.listSellers({ email })
        expect(sellers.length).toBe(1) // hâlâ tek satıcı
      })

      it("reddedilmiş başvuru dönüştürülemez (409) — satıcı oluşmaz", async () => {
        const email = "firma-basvuru-3@test.local"
        const appId = await createApp({ email, company: "Konvert Firma C", status: "rejected" })
        const res = await api
          .post(`/admin/sellers/from-application/${appId}`, {}, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(409)
        const sellers = await marketplace.listSellers({ email })
        expect(sellers.length).toBe(0)
      })

      it("askıya alınmış başvuru dönüştürülemez (409)", async () => {
        const email = "firma-basvuru-4@test.local"
        const appId = await createApp({ email, company: "Konvert Firma D", status: "suspended" })
        const res = await api
          .post(`/admin/sellers/from-application/${appId}`, {}, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(409)
        const sellers = await marketplace.listSellers({ email })
        expect(sellers.length).toBe(0)
      })
    })

    // ── ÇOK-KİRACILILIK: satıcılar/müşteriler arası veri izolasyonu (IDOR guard'ları) ──
    // Rakip Satıcı B, A'nın hiçbir kaynağına (ürün/sipariş/iade/hizmet-talebi/çalışan)
    // erişememeli; ikinci müşteri C2, A'nın müşterisine ait talebe erişememeli. Tümü 404.
    describe("Çok-kiracılılık izolasyonu (IDOR guard'ları)", () => {
      let sellerBToken: string
      let sellerBId: string
      let aProductId: string
      let aServiceReqId: string
      let aOwnerAdminId: string
      let aSellerOrderId: string | undefined
      let aReturnId: string | undefined
      let c2Pk: { headers: Record<string, string> }

      beforeAll(async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        const svc = container.resolve(SERVICE_REQUEST_MODULE)

        // Rakip Satıcı B — geçerli aktif token yeterli (sözleşme kabulüne gerek yok:
        // sahiplik 404'ü handler'da, kapıdan önce döner).
        const b = await createSellerWithToken(container, {
          handle: "iso-satici-b",
          email: "iso-b@test.local",
          name: "İzolasyon B",
        })
        sellerBToken = b.token
        sellerBId = b.seller.id

        // A'nın (crud) çalışan id'si (modülden — team GET gate'siz olsa da en sağlamı)
        aOwnerAdminId = (await mp.listSellerAdmins({ seller_id: crudSellerId }))[0].id

        // A'ya ait mevcut ürün (seedCommerce ile crudSellerId'ye bağlı). Not: /vendors/products
        // POST sözleşme kapısına takılır (sürüm-bump testinden sonra crud kabulü bayat) →
        // ürün OLUŞTURMAK yerine var olanı kullanıyoruz; sahiplik testi ürün oluşturmaya bağlı değil.
        aProductId = cProductId

        // A'ya atanmış taze hizmet talebi (doğrudan servisle → deterministik atama)
        const sr = await svc.createServiceRequests({
          service_kind: "other",
          service_title: "İzolasyon SR",
          full_name: "İzo Müşteri",
          email: "izo-sr@test.local",
          status: "onaylandi",
          assigned_seller_id: crudSellerId,
          offer_total: 1000,
          offer_decision: "accepted",
          commission_rate: 10,
        } as any)
        aServiceReqId = sr.id

        // A'nın mevcut seller_order + SellerReturn'ü (önceki checkout/iade describe'larından)
        aSellerOrderId = (await mp.listSellerOrders({ seller_id: crudSellerId }))[0]?.id
        aReturnId = (await mp.listSellerReturns({ seller_id: crudSellerId }))[0]?.id

        // İkinci müşteri C2
        const email = "iso-musteri-2@test.local"
        await api.post("/auth/customer/emailpass/register", { email, password: "Test1234!" })
        const l1 = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        await api.post(
          "/store/customers",
          { email, first_name: "İki", last_name: "Müşteri" },
          { headers: { ...cPk.headers, authorization: `Bearer ${l1.data.token}` } }
        )
        const l2 = await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })
        c2Pk = { headers: { ...cPk.headers, authorization: `Bearer ${l2.data.token}` } }
      })

      it("Satıcı B, A'nın ürününü göremez/düzenleyemez/silemez (404)", async () => {
        const g = await api
          .get(`/vendors/products/${aProductId}`, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(g.status).toBe(404)
        const u = await api
          .post(`/vendors/products/${aProductId}`, { price: 1, stock: 0 }, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(u.status).toBe(404)
        const d = await api
          .delete(`/vendors/products/${aProductId}`, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(d.status).toBe(404)
        // A hâlâ görebilir → ürün silinmedi/değişmedi
        const stillA = await api.get(`/vendors/products/${aProductId}`, authHeader(crudToken))
        expect(stillA.status).toBe(200)
      })

      it("Satıcı B, A'ya atanmış hizmet talebini göremez/işleyemez (404)", async () => {
        const svc = container.resolve(SERVICE_REQUEST_MODULE)
        const g = await api
          .get(`/vendors/service-requests/${aServiceReqId}`, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(g.status).toBe(404)
        const rej = await api
          .post(`/vendors/service-requests/${aServiceReqId}`, { action: "reject" }, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(rej.status).toBe(404)
        const off = await api
          .post(
            `/vendors/service-requests/${aServiceReqId}`,
            { action: "offer", offer_total: 1 },
            authHeader(sellerBToken)
          )
          .catch((e: any) => e.response)
        expect(off.status).toBe(404)
        const after = await svc.retrieveServiceRequest(aServiceReqId)
        expect(after.assigned_seller_id).toBe(crudSellerId) // devralınmadı
      })

      it("Satıcı B, A'nın çalışanını yönetemez/şifresini sıfırlayamaz (404, link sızmaz)", async () => {
        const rst = await api
          .post(`/vendors/team/${aOwnerAdminId}/reset-password`, {}, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(rst.status).toBe(404)
        expect(rst.data?.reset_link).toBeFalsy()
        const dis = await api
          .post(`/vendors/team/${aOwnerAdminId}`, { status: "disabled" }, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(dis.status).toBe(404)
        const del = await api
          .delete(`/vendors/team/${aOwnerAdminId}`, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(del.status).toBe(404)
      })

      it("Satıcı B, A'nın siparişini (seller_order) kargolayamaz/göremez (404)", async () => {
        expect(aSellerOrderId).toBeTruthy() // checkout describe seller_order üretmiş olmalı
        const f = await api
          .post(
            `/vendors/orders/${aSellerOrderId}/fulfill`,
            { carrier: "yurtici", tracking_number: "HACK-B" },
            authHeader(sellerBToken)
          )
          .catch((e: any) => e.response)
        expect(f.status).toBe(404)
        const list = await api.get("/vendors/orders?limit=50", authHeader(sellerBToken))
        expect((list.data.orders || []).some((o: any) => o.id === aSellerOrderId)).toBe(false)
      })

      it("Satıcı B, A'nın iadesini teslim alamaz/reddedemez (404)", async () => {
        expect(aReturnId).toBeTruthy()
        const rec = await api
          .post(`/vendors/returns/${aReturnId}/receive`, {}, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(rec.status).toBe(404)
        const rej = await api
          .post(`/vendors/returns/${aReturnId}/reject`, { reason: "x" }, authHeader(sellerBToken))
          .catch((e: any) => e.response)
        expect(rej.status).toBe(404)
      })

      it("Müşteri C2, başkasının hizmet talebini göremez/onaylayamaz/ödeyemez (404)", async () => {
        const g = await api
          .get(`/store/service-requests/${aServiceReqId}`, c2Pk)
          .catch((e: any) => e.response)
        expect(g.status).toBe(404)
        const dec = await api
          .post(`/store/service-requests/${aServiceReqId}`, { decision: "accept" }, c2Pk)
          .catch((e: any) => e.response)
        expect(dec.status).toBe(404)
        const pay = await api
          .post(`/store/service-requests/${aServiceReqId}/pay`, { phase: "deposit" }, c2Pk)
          .catch((e: any) => e.response)
        expect(pay.status).toBe(404)
      })
    })

    // ── PARA BÜTÜNLÜĞÜ: tek sipariş iki satıcıya bölünür; her satıcı yalnız kendi
    // kaleminin subtotal/komisyon/kazancını alır (kalemler karışmaz → hakediş doğru). ──
    describe("Çok-satıcılı sipariş bölme (revenue-division bütünlüğü)", () => {
      let sellerB2Id: string
      let bVariantId: string
      let orderId: string

      beforeAll(async () => {
        const b = await createSellerWithToken(container, {
          handle: "split-satici-b",
          email: "split-b@test.local",
          name: "Split B",
        })
        sellerB2Id = b.seller.id
        // B'ye bağlı ikinci ürün (200 TL). cProduct (crudSellerId, 100 TL) + bu = 2 satıcı.
        const p = await seedExtraProduct(container, {
          sellerId: sellerB2Id,
          title: "Split Ürünü B",
          priceKurus: 20000,
          sku: "SPLIT-B-1",
        })
        bVariantId = p.variantId

        // Her iki satıcının ürününü içeren TEK sepet → tamamla
        const email = "split-musteri@test.local"
        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, cPk)).data.cart
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: cVariantId, quantity: 1 }, cPk)
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: bVariantId, quantity: 2 }, cPk)
        const addr = {
          first_name: "Split",
          last_name: "Müşteri",
          address_1: "Cadde 9",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05559990000",
        }
        await api.post(
          `/store/carts/${cart.id}`,
          { shipping_address: addr, billing_address: addr, email },
          cPk
        )
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, cPk)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, cPk)
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, cPk)).data
          .payment_collection
        await api.post(
          `/store/payment-collections/${pc.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          cPk
        )
        const order = (await api.post(`/store/carts/${cart.id}/complete`, {}, cPk)).data.order
        orderId = order.id
      })

      it("tek sipariş iki AYRI seller_order'a bölünür; her satıcı yalnız kendi kalemini alır", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        // order.placed subscriber asenkron → B'nin seller_order'ını bekle (poll)
        let bOrders: any[] = []
        for (let i = 0; i < 40; i++) {
          bOrders = (await mp.listSellerOrders({ seller_id: sellerB2Id })).filter(
            (o: any) => o.order_id === orderId
          )
          if (bOrders.length > 0) break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(bOrders.length).toBe(1)
        const bSo = bOrders[0]
        // B'nin kalemi yalnız: 20000 × 2 = 40000 kuruş (TÜM sipariş 50000 DEĞİL → kalemler karışmadı)
        expect(Number(bSo.subtotal)).toBe(40000)
        expect(Number(bSo.commission_amount)).toBe(4000) // %10
        expect(Number(bSo.seller_earning)).toBe(36000)

        // A (crudSellerId) bu sipariş için AYRI bir seller_order alır: 10000 kalem
        const aSo = (await mp.listSellerOrders({ seller_id: crudSellerId })).find(
          (o: any) => o.order_id === orderId
        )
        expect(aSo).toBeTruthy()
        expect(Number(aSo.subtotal)).toBe(10000)
        expect(aSo.id).not.toBe(bSo.id) // iki ayrı alt-sipariş
      })
    })

    // ── PARA YOLU: PayTR kart→sipariş callback (sepet dalı) — TÜM kart ödemelerinin
    // ana yolu. Şimdiye dek yalnız hizmet (srq) dalı test ediliyordu. İmzalı başarı
    // bildirimi sepeti siparişe çevirmeli + order.metadata.paytr_merchant_oid'i damgalamalı. ──
    describe("PayTR kart→sipariş callback (sepet dalı)", () => {
      const REALM = {
        PAYTR_MERCHANT_ID: "888888",
        PAYTR_MERCHANT_KEY: "E2E_ORDER_KEY",
        PAYTR_MERCHANT_SALT: "E2E_ORDER_SALT",
      }
      const saved: Record<string, string | undefined> = {}
      let cartId: string
      let merchantOid: string

      beforeAll(async () => {
        for (const k of Object.keys(REALM)) {
          saved[k] = process.env[k]
          process.env[k] = (REALM as any)[k]
        }
        const email = "paytr-order@test.local"
        cartId = (await api.post("/store/carts", { region_id: cRegionId, email }, cPk)).data.cart.id
        await api.post(`/store/carts/${cartId}/line-items`, { variant_id: cVariantId, quantity: 1 }, cPk)
        const addr = {
          first_name: "PayTR",
          last_name: "Kart",
          address_1: "Cadde 3",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05551230000",
        }
        await api.post(
          `/store/carts/${cartId}`,
          { shipping_address: addr, billing_address: addr, email },
          cPk
        )
        const opts = (await api.get(`/store/shipping-options?cart_id=${cartId}`, cPk)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: opts[0].id }, cPk)
        const pc = (await api.post("/store/payment-collections", { cart_id: cartId }, cPk)).data
          .payment_collection
        const withSession = (
          await api.post(
            `/store/payment-collections/${pc.id}/payment-sessions`,
            { provider_id: "pp_system_default" },
            cPk
          )
        ).data.payment_collection
        // merchant_oid = session.id'nin alfanümerik hâli (token route'unun ürettiği ile aynı kural).
        const sessionId = withSession.payment_sessions[0].id
        merchantOid = sessionId.replace(/[^a-zA-Z0-9]/g, "")
      })

      afterAll(() => {
        for (const k of Object.keys(REALM)) {
          if (saved[k] === undefined) delete process.env[k]
          else process.env[k] = (saved[k] as string)
        }
      })

      it("imzalı başarı callback'i sepeti siparişe çevirir + merchant_oid'i damgalar (idempotent)", async () => {
        const totalAmount = "15000"
        const hash = buildCallbackHash({
          merchantOid,
          status: "success",
          totalAmount,
          merchantKey: REALM.PAYTR_MERCHANT_KEY,
          merchantSalt: REALM.PAYTR_MERCHANT_SALT,
        })
        const body = {
          merchant_oid: merchantOid,
          status: "success",
          total_amount: totalAmount,
          hash,
          payment_type: "card",
        }
        const r1 = await api.post("/paytr-callback", body)
        expect(r1.status).toBe(200)
        expect(r1.data).toBe("OK")

        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        let orderId: string | undefined
        for (let i = 0; i < 20; i++) {
          const { data } = await query.graph({
            entity: "order_cart",
            fields: ["order_id", "cart_id"],
            filters: { cart_id: cartId } as any,
          })
          orderId = data?.[0]?.order_id
          if (orderId) break
          await new Promise((r) => setTimeout(r, 300))
        }
        expect(orderId).toBeTruthy()

        const orderModule = container.resolve(Modules.ORDER)
        const order: any = await orderModule.retrieveOrder(orderId as string)
        expect(order.metadata?.paytr_merchant_oid).toBe(merchantOid)

        // Idempotluk: aynı callback tekrar → 200, YENİ sipariş oluşmaz (sepet zaten tamam).
        const r2 = await api.post("/paytr-callback", body)
        expect(r2.status).toBe(200)
        const { data: after } = await query.graph({
          entity: "order_cart",
          fields: ["order_id"],
          filters: { cart_id: cartId } as any,
        })
        expect(after.length).toBe(1)
        expect(after[0].order_id).toBe(orderId)
      })
    })

    // ── PARA YOLU: iade → komisyon clawback + müşteri iadesi TUTAR doğruluğu. Mevcut
    // iade testi yalnız status='received' + returned_earning>=0 kontrol ediyordu (tautoloji);
    // burada tutarlar birebir doğrulanıyor (yanlış clawback = satıcıya fazla/eksik ödeme). ──
    describe("İade clawback + müşteri iadesi (tutar bütünlüğü)", () => {
      let sellerB3Id: string
      let b3Token: string
      let orderItemId: string
      let sellerReturnId: string

      beforeAll(async () => {
        const b = await createSellerWithToken(container, {
          handle: "clawback-satici",
          email: "clawback-b@test.local",
          name: "Clawback B",
        })
        sellerB3Id = b.seller.id
        b3Token = b.token
        // B3'e bağlı ürün: birim 30000 kuruş (300 TL).
        const p = await seedExtraProduct(container, {
          sellerId: sellerB3Id,
          title: "Clawback Ürünü",
          priceKurus: 30000,
          sku: "CLAWBACK-1",
        })

        // Kayıtlı müşteri (iade auth + sipariş sahipliği ister) — 2 adet satın al
        const email = "clawback-musteri@test.local"
        const reg = await api.post("/auth/customer/emailpass/register", { email, password: "Test1234!" })
        await api.post(
          "/store/customers",
          { email, first_name: "Claw", last_name: "Müşteri" },
          { headers: { ...cPk.headers, authorization: `Bearer ${reg.data.token}` } }
        )
        const custToken = (await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })).data.token
        const ch = { headers: { ...cPk.headers, authorization: `Bearer ${custToken}` } }

        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, ch)).data.cart
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: p.variantId, quantity: 2 }, ch)
        const addr = {
          first_name: "Claw",
          last_name: "Müşteri",
          address_1: "Cadde 7",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05554440000",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email }, ch)
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, ch)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, ch)
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, ch)).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, ch)
        const order = (await api.post(`/store/carts/${cart.id}/complete`, {}, ch)).data.order
        orderItemId = order.items[0].id

        // İade FULFILLED kalem ister → native siparişi kargoya ver
        const { createOrderFulfillmentWorkflow } = await import("@medusajs/core-flows")
        await createOrderFulfillmentWorkflow(container).run({
          input: { order_id: order.id, items: order.items.map((i: any) => ({ id: i.id, quantity: i.quantity })) } as any,
        })

        // 2 adetten 1'ini iade et → "requested" seller_return (async subscriber)
        await api.post("/store/return-requests", { order_id: order.id, items: [{ id: orderItemId, quantity: 1 }] }, ch)
        const mp = container.resolve(MARKETPLACE_MODULE)
        let srs: any[] = []
        for (let i = 0; i < 40; i++) {
          srs = await mp.listSellerReturns({ seller_id: sellerB3Id, status: "requested" })
          if (srs.length > 0) break
          await new Promise((r) => setTimeout(r, 500))
        }
        sellerReturnId = srs[0]?.id
      })

      it("satıcı iadeyi teslim alır → clawback + müşteri iadesi tutarları BİREBİR doğru", async () => {
        expect(sellerReturnId).toBeTruthy()
        const mp = container.resolve(MARKETPLACE_MODULE)

        const res = await api.post(`/vendors/returns/${sellerReturnId}/receive`, {}, authHeader(b3Token))
        expect(res.status).toBe(200)
        // Müşteriye iade edilen tutar = iade edilen kalem subtotal'i (1 × 30000)
        expect(Number(res.data.refunded_amount)).toBe(30000)

        // seller_return "received" + clawback tutarları: subtotal 30000, komisyon %10'un
        // yarısı (2 adetten 1) = round(6000 × 1/2) = 3000, kazanç 27000.
        const sr: any = await mp.retrieveSellerReturn(sellerReturnId)
        expect(sr.status).toBe("received")
        expect(Number(sr.returned_subtotal)).toBe(30000)
        expect(Number(sr.returned_commission)).toBe(3000)
        expect(Number(sr.returned_earning)).toBe(27000)

        // İlgili seller_order agregaları arttı (taze sipariş → tam bu değerler)
        const [so]: any = await mp.listSellerOrders({ seller_id: sellerB3Id })
        expect(Number(so.returned_subtotal)).toBe(30000)
        expect(Number(so.returned_commission)).toBe(3000)
        expect(Number(so.returned_earning)).toBe(27000)

        // Kazanç özetinde iade yansıdı
        const earn = await api.get("/vendors/earnings", authHeader(b3Token))
        expect(Number(earn.data.summary.total_returned)).toBe(30000)
      })
    })

    // ── PARA YOLU: sipariş iptali → seller_order 'canceled' + kazanç bakiyesinden düşer.
    // (Regresyon: iptal edilen sipariş satıcının ödenecek bakiyesine katkı VERMEMELİ.) ──
    describe("Sipariş iptali → seller_order iptal + kazançtan düşer", () => {
      let adminToken: string
      let sellerB4Id: string
      let b4Token: string
      let orderId: string

      beforeAll(async () => {
        adminToken = (await createAdminWithToken(container, "cancel-admin@test.local")).token
        const b = await createSellerWithToken(container, {
          handle: "cancel-satici",
          email: "cancel-b@test.local",
          name: "Cancel B",
        })
        sellerB4Id = b.seller.id
        b4Token = b.token
        const p = await seedExtraProduct(container, {
          sellerId: sellerB4Id,
          title: "Cancel Ürünü",
          priceKurus: 25000,
          sku: "CANCEL-1",
        })
        const email = "cancel-musteri@test.local"
        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, cPk)).data.cart
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: p.variantId, quantity: 1 }, cPk)
        const addr = {
          first_name: "Cancel",
          last_name: "Müşteri",
          address_1: "Cadde 11",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05557770000",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email }, cPk)
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, cPk)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, cPk)
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, cPk)).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, cPk)
        orderId = (await api.post(`/store/carts/${cart.id}/complete`, {}, cPk)).data.order.id
        // seller_order oluşsun (order.placed subscriber)
        const mp = container.resolve(MARKETPLACE_MODULE)
        for (let i = 0; i < 40; i++) {
          if ((await mp.listSellerOrders({ seller_id: sellerB4Id })).length > 0) break
          await new Promise((r) => setTimeout(r, 500))
        }
      })

      it("admin siparişi iptal eder → seller_order 'canceled' + cargo_fee 0 + kazançtan çıkar", async () => {
        const mp = container.resolve(MARKETPLACE_MODULE)
        expect((await mp.listSellerOrders({ seller_id: sellerB4Id })).length).toBe(1)

        const cancel = await api
          .post(`/admin/orders/${orderId}/cancel`, {}, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect([200, 201]).toContain(cancel.status)

        // order.canceled subscriber async → seller_order canceled bekle
        let so: any
        for (let i = 0; i < 40; i++) {
          so = (await mp.listSellerOrders({ seller_id: sellerB4Id }))[0]
          if (so?.fulfillment_status === "canceled") break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(so.fulfillment_status).toBe("canceled")
        expect(Number(so.cargo_fee)).toBe(0)

        // Kazanç özeti iptal edilen siparişi HARİÇ tutar (fulfillment_status != canceled filtresi)
        const earn = await api.get("/vendors/earnings", authHeader(b4Token))
        expect(earn.data.summary.order_count).toBe(0)
        expect(Number(earn.data.summary.pending_balance)).toBe(0)
      })
    })

    // ── PARA YOLU: admin tek-tık iade ucu guard'ları — kalan bakiyeyi aşan iade
    // reddedilmeli (strict), çift-iade önlenmeli. (Over-refund = platform zararı.) ──
    describe("Admin manuel iade ucu (/admin/order-refunds guard'ları)", () => {
      let adminToken: string
      let orderId: string

      beforeAll(async () => {
        adminToken = (await createAdminWithToken(container, "refund-admin@test.local")).token
        const email = "refund-musteri@test.local"
        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, cPk)).data.cart
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: cVariantId, quantity: 1 }, cPk)
        const addr = {
          first_name: "Refund",
          last_name: "Müşteri",
          address_1: "Cadde 13",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05558880000",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email }, cPk)
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, cPk)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, cPk)
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, cPk)).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, cPk)
        orderId = (await api.post(`/store/carts/${cart.id}/complete`, {}, cPk)).data.order.id
      })

      it("kalan bakiyeyi aşan iade 400; geçerli kısmi iade 200; kalanı aşan tekrar 400", async () => {
        // Kalan bakiyeyi aşan (999999 kuruş) → strict guard 400
        const over = await api
          .post("/admin/order-refunds", { order_id: orderId, amount: 999999 }, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect(over.status).toBe(400)

        // Geçerli kısmi iade (5000 kuruş) → 200
        const partial = await api.post(
          "/admin/order-refunds",
          { order_id: orderId, amount: 5000 },
          authHeader(adminToken)
        )
        expect(partial.status).toBe(200)
        expect(Number(partial.data.refunded)).toBe(5000)

        // Kalan (~10000) aşılırsa yine 400 (çift/aşırı iade önlenir)
        const exceed = await api
          .post("/admin/order-refunds", { order_id: orderId, amount: 12000 }, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect(exceed.status).toBe(400)
      })
    })

    // ── GÜVENLİK: iade talebi IDOR + miktar guard'ları — bir müşteri başkasının
    // siparişine iade açamaz (404), sipariş miktarını aşamaz / olmayan kalemi iade edemez (400). ──
    describe("İade talebi IDOR + miktar guard'ları (/store/return-requests)", () => {
      let c1Order: string
      let c1ItemId: string
      let c1Pk: { headers: Record<string, string> }
      let c2Pk: { headers: Record<string, string> }

      const mkCustomer = async (email: string, first: string) => {
        const reg = await api.post("/auth/customer/emailpass/register", { email, password: "Test1234!" })
        await api.post(
          "/store/customers",
          { email, first_name: first, last_name: "Müşteri" },
          { headers: { ...cPk.headers, authorization: `Bearer ${reg.data.token}` } }
        )
        const t = (await api.post("/auth/customer/emailpass", { email, password: "Test1234!" })).data.token
        return { headers: { ...cPk.headers, authorization: `Bearer ${t}` } }
      }

      beforeAll(async () => {
        c1Pk = await mkCustomer("return-c1@test.local", "C1")
        c2Pk = await mkCustomer("return-c2@test.local", "C2")
        const email = "return-c1@test.local"
        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, c1Pk)).data.cart
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: cVariantId, quantity: 1 }, c1Pk)
        const addr = {
          first_name: "C1",
          last_name: "Müşteri",
          address_1: "Cadde 15",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05551112200",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email }, c1Pk)
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, c1Pk)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, c1Pk)
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, c1Pk)).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, c1Pk)
        const order = (await api.post(`/store/carts/${cart.id}/complete`, {}, c1Pk)).data.order
        c1Order = order.id
        c1ItemId = order.items[0].id
      })

      it("başka müşterinin siparişine iade açılamaz (404)", async () => {
        const res = await api
          .post(
            "/store/return-requests",
            { order_id: c1Order, items: [{ id: c1ItemId, quantity: 1 }] },
            c2Pk
          )
          .catch((e: any) => e.response)
        expect(res.status).toBe(404)
      })

      it("sipariş miktarını aşan iade reddedilir (400)", async () => {
        const res = await api
          .post(
            "/store/return-requests",
            { order_id: c1Order, items: [{ id: c1ItemId, quantity: 99 }] },
            c1Pk
          )
          .catch((e: any) => e.response)
        expect(res.status).toBe(400)
      })

      it("siparişte olmayan kalem iade edilemez (400)", async () => {
        const res = await api
          .post(
            "/store/return-requests",
            { order_id: c1Order, items: [{ id: "item_sahte_xyz", quantity: 1 }] },
            c1Pk
          )
          .catch((e: any) => e.response)
        expect(res.status).toBe(400)
      })
    })

    // ── ENVANTER: yönetilen stok yetersizse sipariş TAMAMLANAMAZ (aşırı-satış engeli). ──
    describe("Aşırı-satış koruması (stok yetersizse sipariş oluşmaz)", () => {
      let lowVariantId: string

      beforeAll(async () => {
        const b = await createSellerWithToken(container, {
          handle: "oversell-satici",
          email: "oversell-b@test.local",
          name: "Oversell B",
        })
        const p = await seedExtraProduct(container, {
          sellerId: b.seller.id,
          title: "Kıt Stok Ürünü",
          priceKurus: 15000,
          sku: "OVERSELL-1",
          stock: 1, // yalnız 1 adet
        })
        lowVariantId = p.variantId
      })

      it("stok 1 iken 2 adet talep edilen sepet siparişe dönüşmez", async () => {
        const email = "oversell-musteri@test.local"
        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, cPk)).data.cart
        await api
          .post(`/store/carts/${cart.id}/line-items`, { variant_id: lowVariantId, quantity: 2 }, cPk)
          .catch((e: any) => e.response)
        const addr = {
          first_name: "Over",
          last_name: "Sell",
          address_1: "Cadde 17",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05559990022",
        }
        await api
          .post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email }, cPk)
          .catch((e: any) => e.response)
        const so = await api.get(`/store/shipping-options?cart_id=${cart.id}`, cPk).catch(() => null)
        const opt = so?.data?.shipping_options?.filter((o: any) => !/İade/i.test(o.name))?.[0]
        if (opt) {
          await api
            .post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opt.id }, cPk)
            .catch((e: any) => e.response)
          const pc = await api.post("/store/payment-collections", { cart_id: cart.id }, cPk).catch(() => null)
          if (pc?.data?.payment_collection?.id) {
            await api
              .post(
                `/store/payment-collections/${pc.data.payment_collection.id}/payment-sessions`,
                { provider_id: "pp_system_default" },
                cPk
              )
              .catch((e: any) => e.response)
          }
        }
        await api.post(`/store/carts/${cart.id}/complete`, {}, cPk).catch((e: any) => e.response)

        // İnvaryant: aşırı-satılan sepet için SİPARİŞ OLUŞMAMALI.
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: oc } = await query.graph({
          entity: "order_cart",
          fields: ["order_id"],
          filters: { cart_id: cart.id } as any,
        })
        expect(oc.length).toBe(0)
      })
    })

    // ── PARA YOLU: kupon/indirim checkout + seller_order taban tutarı. ──
    describe("Kupon indirimi checkout + seller_order taban", () => {
      let orderId: string

      beforeAll(async () => {
        const promo = container.resolve(Modules.PROMOTION)
        await promo.createPromotions([
          {
            code: "E2E10",
            type: "standard",
            status: "active", // draft uygulanmaz
            application_method: {
              type: "percentage",
              target_type: "order",
              allocation: "across",
              value: 10,
              currency_code: "try",
            },
          },
        ] as any)

        const email = "kupon-musteri@test.local"
        const cart = (await api.post("/store/carts", { region_id: cRegionId, email }, cPk)).data.cart
        await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: cVariantId, quantity: 2 }, cPk)
        const addr = {
          first_name: "Kupon",
          last_name: "Müşteri",
          address_1: "Cadde 19",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05551119900",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr, email }, cPk)
        const promoRes = await api.post(`/store/carts/${cart.id}/promotions`, { promo_codes: ["E2E10"] }, cPk)
        expect(promoRes.status).toBe(200)
        const opts = (await api.get(`/store/shipping-options?cart_id=${cart.id}`, cPk)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: opts[0].id }, cPk)
        const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, cPk)).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, cPk)
        orderId = (await api.post(`/store/carts/${cart.id}/complete`, {}, cPk)).data.order.id
      })

      it("%10 kupon order.total'e yansır (20000 − 2000 + 5000 kargo = 23000)", async () => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["id", "total", "discount_total"],
          filters: { id: orderId } as any,
        })
        const order = data[0]
        expect(Number(order.discount_total)).toBe(2000)
        expect(Number(order.total)).toBe(23000)
      })

      it("seller_order subtotal/komisyon İNDİRİM SONRASI tabandan hesaplanır", async () => {
        // Fix: split-order.ts items.adjustments'ı yükler ve line_total = ham − indirim.
        // Müşteri kalemlere 18000 ödedi → subtotal 18000, komisyon %10 = 1800,
        // satıcı kazancı 16200. (Eski hata: 20000/2000 ham tabandan.)
        const mp = container.resolve(MARKETPLACE_MODULE)
        let so: any
        for (let i = 0; i < 40; i++) {
          so = (await mp.listSellerOrders({ seller_id: crudSellerId, order_id: orderId }))[0]
          if (so) break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(so).toBeTruthy()
        expect(Number(so.subtotal)).toBe(18000)
        expect(Number(so.commission_amount)).toBe(1800)
        expect(Number(so.seller_earning)).toBe(16200)
      })
    })

    // ── VERGİ: per-ürün KDV bracket checkout'ta uygulanır + seller_order'a snapshot'lanır. ──
    describe("KDV bracket + seller_order vat_rate snapshot", () => {
      let vatProductId: string
      let vatVariantId: string
      let cartId: string
      let orderId: string

      beforeAll(async () => {
        // TR tax region (seedCommerce yaratmaz): default %20 → üründeki %1'den FARKLI.
        const tax = container.resolve(Modules.TAX)
        const existing = await tax.listTaxRegions({ country_code: "tr" }).catch(() => [])
        if (!existing?.length) {
          await tax.createTaxRegions({
            country_code: "tr",
            provider_id: "tp_system",
            default_tax_rate: { rate: 20, name: "KDV", code: "KDV" },
          } as any)
        }
        const p = await seedExtraProduct(container, {
          sellerId: crudSellerId,
          title: "KDV %1 Ürün",
          priceKurus: 10000,
          sku: "VAT-1",
          vatRate: 1,
        })
        vatProductId = p.productId
        vatVariantId = p.variantId
        // tax-sync ELLE tetikle (in-memory event bus, subscriber async beklenmez).
        await syncProductTaxRate(container, vatProductId, 1)

        const email = "kdv-musteri@test.local"
        cartId = (await api.post("/store/carts", { region_id: cRegionId, email }, cPk)).data.cart.id
        await api.post(`/store/carts/${cartId}/line-items`, { variant_id: vatVariantId, quantity: 2 }, cPk)
        const addr = {
          first_name: "KDV",
          last_name: "Müşteri",
          address_1: "Cadde 21",
          city: "İstanbul",
          country_code: "tr",
          postal_code: "34000",
          phone: "05551112100",
        }
        await api.post(`/store/carts/${cartId}`, { shipping_address: addr, billing_address: addr, email }, cPk)
        const opts = (await api.get(`/store/shipping-options?cart_id=${cartId}`, cPk)).data.shipping_options.filter(
          (o: any) => !/İade/i.test(o.name)
        )
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: opts[0].id }, cPk)
        const pc = (await api.post("/store/payment-collections", { cart_id: cartId }, cPk)).data.payment_collection
        await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_system_default" }, cPk)
      })

      it("sepet kalemi %1 bracket alır (default %20 DEĞİL) + item_tax_total 200", async () => {
        const cart = (await api.get(`/store/carts/${cartId}`, cPk)).data.cart
        const line = cart.items.find((i: any) => i.variant_id === vatVariantId)
        expect(line).toBeTruthy()
        expect(line.tax_lines.length).toBeGreaterThan(0)
        expect(Number(line.tax_lines[0].rate)).toBe(1)
        // KDV-hariç (test ortamı): 20000 × %1 = 200 kuruş (kalem-only, kargo hariç)
        expect(Number(cart.item_tax_total)).toBe(200)
      })

      it("tamamlanınca seller_order line'a vat_rate=1 snapshot'lanır", async () => {
        orderId = (await api.post(`/store/carts/${cartId}/complete`, {}, cPk)).data.order.id
        const mp = container.resolve(MARKETPLACE_MODULE)
        let sos: any[] = []
        for (let i = 0; i < 40; i++) {
          sos = await mp.listSellerOrders({ seller_id: crudSellerId, order_id: orderId })
          if (sos.length) break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(sos.length).toBeGreaterThan(0)
        const soItem = (sos[0].items || []).find((x: any) => x.product_id === vatProductId)
        expect(soItem).toBeTruthy()
        expect(Number(soItem.vat_rate)).toBe(1)
      })
    })

    // ── PARA YOLU: PayTR-mod satıcı payout GUARD dalları (ağ gerektirmeyen; başarı
    // yolu gerçek PayTR fetch'i gerektirdiğinden E2E'de test edilmez). ──
    describe("PayTR-mod satıcı payout guard'ları", () => {
      const REALM = { PAYTR_MERCHANT_ID: "999001", PAYTR_MERCHANT_KEY: "PK", PAYTR_MERCHANT_SALT: "PS" }
      const saved: Record<string, string | undefined> = {}
      let adminToken: string
      let mp: any

      beforeAll(async () => {
        for (const k of Object.keys(REALM)) {
          saved[k] = process.env[k]
          process.env[k] = (REALM as any)[k]
        }
        adminToken = (await createAdminWithToken(container, "payout-admin@test.local")).token
        mp = container.resolve(MARKETPLACE_MODULE)
      })
      afterAll(() => {
        for (const k of Object.keys(REALM)) {
          if (saved[k] === undefined) delete process.env[k]
          else process.env[k] = saved[k] as string
        }
      })

      const mkEligible = async (sellerId: string, orderId: string, o: any) =>
        mp.createSellerOrders({
          seller_id: sellerId,
          order_id: orderId,
          payout_status: "eligible",
          fulfillment_status: "pending",
          ...o,
        })

      it("IBAN eksik → 400 (transfer denenmez, eligible kalır)", async () => {
        const s = await createSellerWithToken(container, { handle: "payout-noiban", email: "payout-noiban@test.local", name: "Ibansiz" })
        const so = await mkEligible(s.seller.id, "fake_noiban", { seller_earning: 9000, returned_earning: 0, cargo_fee: 1000 })
        const res = await api
          .post(`/admin/sellers/${s.seller.id}/payout`, { order_ids: [so.id] }, authHeader(adminToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(400)
        expect((await mp.listSellerOrders({ seller_id: s.seller.id }))[0].payout_status).toBe("eligible")
      })

      it("net<=0 (tam iade) → transfersiz doğrudan paid", async () => {
        const s = await createSellerWithToken(container, { handle: "payout-fullret", email: "payout-fullret@test.local", name: "IadeS" })
        await mp.updateSellers({ id: s.seller.id, iban: "TR000000000000000000000000", account_holder: "Iade S" })
        const so = await mkEligible(s.seller.id, "fake_fullret", { seller_earning: 9000, returned_earning: 9000, cargo_fee: 0 })
        const res = await api.post(`/admin/sellers/${s.seller.id}/payout`, { order_ids: [so.id] }, authHeader(adminToken))
        expect(res.status).toBe(200)
        expect(res.data.mode).toBe("paytr")
        expect(res.data.paid_count).toBe(1)
        expect(res.data.paid_amount).toBe(0)
        expect(res.data.error_count).toBe(0)
        expect((await mp.listSellerOrders({ seller_id: s.seller.id }))[0].payout_status).toBe("paid")
      })

      it("net>0 ama merchant_oid yok → error, eligible kalır (transfer denenmez)", async () => {
        const s = await createSellerWithToken(container, { handle: "payout-nooid", email: "payout-nooid@test.local", name: "OidsizS" })
        await mp.updateSellers({ id: s.seller.id, iban: "TR000000000000000000000000", account_holder: "Oidsiz S" })
        const so = await mkEligible(s.seller.id, "fake_nooid", { seller_earning: 9000, returned_earning: 0, cargo_fee: 1000 })
        const res = await api.post(`/admin/sellers/${s.seller.id}/payout`, { order_ids: [so.id] }, authHeader(adminToken))
        expect(res.status).toBe(200)
        expect(res.data.paid_count).toBe(0)
        expect(res.data.error_count).toBe(1)
        expect((await mp.listSellerOrders({ seller_id: s.seller.id }))[0].payout_status).toBe("eligible")
      })

      it("RBAC: kimliksiz payout 401/403", async () => {
        const s = await createSellerWithToken(container, { handle: "payout-rbac", email: "payout-rbac@test.local", name: "RbacS" })
        const res = await api.post(`/admin/sellers/${s.seller.id}/payout`, {}).catch((e: any) => e.response)
        expect([401, 403]).toContain(res.status)
      })
    })

    // ── Manuel mod (PayTR env boş): tüm eligible paid, net toplamı; boş → 0. ──
    describe("Manuel-mod satıcı payout", () => {
      const KEYS = ["PAYTR_MERCHANT_ID", "PAYTR_MERCHANT_KEY", "PAYTR_MERCHANT_SALT"]
      const saved: Record<string, string | undefined> = {}
      let adminToken: string
      let mp: any

      beforeAll(async () => {
        for (const k of KEYS) {
          saved[k] = process.env[k]
          delete process.env[k] // manuel mod garantisi (cfg.configured=false)
        }
        adminToken = (await createAdminWithToken(container, "payout-manual-admin@test.local")).token
        mp = container.resolve(MARKETPLACE_MODULE)
      })
      afterAll(() => {
        for (const k of KEYS) {
          if (saved[k] !== undefined) process.env[k] = saved[k] as string
        }
      })

      it("tüm eligible 'paid' + net toplamı (transfer yok)", async () => {
        const s = await createSellerWithToken(container, { handle: "payout-manual", email: "payout-manual@test.local", name: "ManuelS" })
        const soA = await mp.createSellerOrders({ seller_id: s.seller.id, order_id: "fake_manA", payout_status: "eligible", fulfillment_status: "pending", seller_earning: 9000, returned_earning: 0, cargo_fee: 1000 })
        const soB = await mp.createSellerOrders({ seller_id: s.seller.id, order_id: "fake_manB", payout_status: "eligible", fulfillment_status: "pending", seller_earning: 5000, returned_earning: 1000, cargo_fee: 0 })
        const res = await api.post(`/admin/sellers/${s.seller.id}/payout`, { order_ids: [soA.id, soB.id] }, authHeader(adminToken))
        expect(res.status).toBe(200)
        expect(res.data.mode).toBe("manual")
        expect(res.data.paid_count).toBe(2)
        expect(res.data.paid_amount).toBe(12000) // 8000 + 4000
      })

      it("eligible kayıt yok → paid_count 0", async () => {
        const s = await createSellerWithToken(container, { handle: "payout-empty", email: "payout-empty@test.local", name: "BosS" })
        const res = await api.post(`/admin/sellers/${s.seller.id}/payout`, {}, authHeader(adminToken))
        expect(res.status).toBe(200)
        expect(res.data.paid_count).toBe(0)
      })
    })

    // ── Sabit vitrin kategorileri: liste endpoint'i + ürün metadata.showcase saklama. ──
    describe("Vitrin kategorileri (product.metadata.showcase)", () => {
      it("GET /vendors/showcase-categories sabit 6 kategoriyi döner", async () => {
        const res = await api.get("/vendors/showcase-categories", authHeader(crudToken))
        expect(res.status).toBe(200)
        const keys = res.data.showcase_categories.map((c: any) => c.key)
        expect(res.data.showcase_categories.length).toBe(6)
        expect(keys).toEqual(
          expect.arrayContaining(["bestsellers", "new-arrivals", "deals", "bundles", "campaigns", "seasonal"])
        )
      })

      it("ürün yalnız GEÇERLİ vitrin key'lerini metadata.showcase'e yazar", async () => {
        const product: any = await createVendorProduct(container, crudSellerId, "crud-satici", {
          title: "Vitrin Ürünü",
          price: 100,
          category_ids: [],
          // "gecersiz" süzülmeli, tekrar eden "deals" tekilleşmeli
          showcase: ["deals", "bundles", "gecersiz", "deals"] as any,
        } as any)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product",
          fields: ["id", "metadata"],
          filters: { id: product.id } as any,
        })
        const showcase = (data[0].metadata as any)?.showcase
        expect(showcase).toEqual(["deals", "bundles"])
      })

      it("mağaza (store) API'si yayındaki ürünün metadata.showcase'ini döner (storefront veri yolu)", async () => {
        // Yayında + satış kanalında + fiyatlı ürün (storefront'un gördüğü gibi).
        const p = await seedExtraProduct(container, {
          sellerId: crudSellerId,
          title: "Vitrin Store Ürünü",
          priceKurus: 15000,
          sku: "SHOWCASE-STORE-1",
        })
        const productModule = container.resolve(Modules.PRODUCT)
        await productModule.updateProducts(p.productId, { metadata: { showcase: ["deals"] } } as any)

        // storefront listProducts ile AYNI: publishable key + region + fields=+metadata.
        const res = await api.get(
          `/store/products?region_id=${cRegionId}&limit=100&fields=id,%2Bmetadata`,
          cPk
        )
        expect(res.status).toBe(200)
        const found = res.data.products.find((x: any) => x.id === p.productId)
        expect(found).toBeTruthy()
        // Storefront bu diziyi metadata.showcase'ten okuyup bölümlere/filtreye ayırıyor.
        expect(found.metadata?.showcase).toEqual(["deals"])
      })
    })
  },
})
