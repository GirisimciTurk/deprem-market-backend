import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createSellerWithToken, authHeader } from "./_helpers"
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
  },
})
