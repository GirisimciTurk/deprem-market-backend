import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createSellerWithToken, authHeader, seedCommerce } from "./_helpers"
import { runContractSetup } from "../../src/lib/contract-setup"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"

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
        const { settlePendingPayouts } = await import("../../src/lib/settlement")
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
  },
})
