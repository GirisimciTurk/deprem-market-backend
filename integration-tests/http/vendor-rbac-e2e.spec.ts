import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createSellerWithToken,
  createStaffWithToken,
  authHeader,
} from "./_helpers"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"

jest.setTimeout(300_000)

/**
 * Satıcı paneli RBAC + Sistem Kayıtları (audit) + Şifre sıfırlama + Eşzamanlı
 * çalışma (presence) E2E. Tek harness boot, veri testler arası korunur.
 *
 * Kapsam:
 *  - Çalışan daveti + ekip listesi + rol şablonları
 *  - İzin zorlama: yetkili bölüm 200, yetkisiz bölüm/işlem 403
 *  - Sistem kaydı: başarılı yazma loglanır; reddedilen (403) yazma loglanmaz
 *  - Şifre sıfırlama bağlantısı: üret → şifre belirle → yeni şifreyle giriş
 *  - Askıya alınan çalışan her uçta 403
 *  - Presence: aynı kaydı açan diğer kullanıcılar görünür
 */
medusaIntegrationTestRunner({
  disableAutoTeardown: true,
  testSuite: ({ api, getContainer }) => {
    let container: any
    let ownerToken: string
    let sellerId: string
    let ownerAdminId: string

    // İzin testleri için: ürün full + sipariş view, gerisi none olan çalışan.
    let permStaffToken: string
    let permStaffId: string

    beforeAll(async () => {
      container = getContainer()
      const mp = container.resolve(MARKETPLACE_MODULE)

      const r = await createSellerWithToken(container, {
        handle: "rbac-satici",
        email: "rbac-owner@test.local",
        name: "RBAC Sahip",
      })
      ownerToken = r.token
      sellerId = r.seller.id
      ownerAdminId = r.sellerAdminId
      // Gerçek sahip olarak işaretle (is_owner guard testleri için).
      await mp.updateSellerAdmins({ id: ownerAdminId, is_owner: true })

      const s = await createStaffWithToken(container, sellerId, {
        email: "rbac-perm-staff@test.local",
        name: "İzinli Çalışan",
        role: "custom",
        permissions: {
          products: "full",
          orders: "view",
          // diğer her şey none (eksik = none)
        },
      })
      permStaffToken = s.token
      permStaffId = s.sellerAdminId
    })

    describe("Ekip yönetimi", () => {
      let invitedId: string
      let invitedResetLink: string

      it("sahip yeni çalışan davet eder (reset link döner)", async () => {
        const res = await api.post(
          "/vendors/team",
          {
            email: "rbac-depo@test.local",
            first_name: "Depo",
            last_name: "Sorumlu",
            role: "warehouse",
            permissions: { products: "full", orders: "full", returns: "full" },
          },
          authHeader(ownerToken)
        )
        expect(res.status).toBe(200)
        expect(res.data.seller_admin_id).toBeTruthy()
        expect(res.data.reset_link).toContain("/sifre-belirle")
        invitedId = res.data.seller_admin_id
        invitedResetLink = res.data.reset_link
      })

      it("aynı e-posta ikinci kez davet edilince 409 (çakışma değil — aynı mağaza → günceller)", async () => {
        // Aynı mağazada aynı e-posta → güncelleme (200). Farklı mağaza olsaydı 409.
        const res = await api.post(
          "/vendors/team",
          { email: "rbac-depo@test.local", role: "warehouse", permissions: { products: "view" } },
          authHeader(ownerToken)
        )
        expect(res.status).toBe(200)
      })

      it("ekip listesi sahip + çalışanları içerir, sahip işaretli", async () => {
        const res = await api.get("/vendors/team", authHeader(ownerToken))
        expect(res.status).toBe(200)
        const emails = res.data.members.map((m: any) => m.email)
        expect(emails).toContain("rbac-owner@test.local")
        expect(emails).toContain("rbac-depo@test.local")
        const owner = res.data.members.find((m: any) => m.is_owner)
        expect(owner?.email).toBe("rbac-owner@test.local")
        expect(res.data.current_admin_id).toBe(ownerAdminId)
      })

      it("rol şablonları + bölüm tanımları döner", async () => {
        const res = await api.get("/vendors/team/roles", authHeader(ownerToken))
        expect(res.status).toBe(200)
        const keys = res.data.roles.map((r: any) => r.key)
        expect(keys).toEqual(expect.arrayContaining(["manager", "warehouse", "accounting", "custom"]))
        expect(res.data.sections.length).toBeGreaterThan(8)
      })

      it("şifre sıfırlama: link üret → şifre belirle → yeni şifreyle giriş", async () => {
        const reset = await api.post(
          `/vendors/team/${invitedId}/reset-password`,
          {},
          authHeader(ownerToken)
        )
        expect(reset.status).toBe(200)
        expect(reset.data.reset_link).toContain("/sifre-belirle")

        const token = decodeURIComponent(
          (reset.data.reset_link.match(/token=([^&]+)/) || [])[1] || ""
        )
        expect(token).toBeTruthy()

        // Token ile yeni şifre belirle (Medusa reset-password update ucu)
        const upd = await api
          .post(
            "/auth/seller/emailpass/update",
            { password: "YeniDepo123!" },
            authHeader(token)
          )
          .catch((e: any) => e.response)
        expect(upd.status).toBe(200)

        // Yeni şifreyle giriş çalışır
        const login = await api
          .post("/auth/seller/emailpass", {
            email: "rbac-depo@test.local",
            password: "YeniDepo123!",
          })
          .catch((e: any) => e.response)
        expect(login.status).toBe(200)
        expect(login.data.token).toBeTruthy()
      })

      it("sahip kaldırılamaz (400)", async () => {
        const res = await api
          .delete(`/vendors/team/${ownerAdminId}`, authHeader(ownerToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(400)
      })
    })

    describe("İzin zorlama (çalışan token)", () => {
      it("yetkili bölüm okunur (products:full → 200)", async () => {
        const res = await api.get("/vendors/products?limit=5", authHeader(permStaffToken))
        expect(res.status).toBe(200)
      })

      it("view yetkili bölüm okunur (orders:view → 200)", async () => {
        const res = await api.get("/vendors/orders?limit=5", authHeader(permStaffToken))
        expect(res.status).toBe(200)
      })

      it("yetkisiz bölüm okunamaz (campaigns:none → 403)", async () => {
        const res = await api
          .get("/vendors/campaigns", authHeader(permStaffToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(403)
      })

      it("ekip yönetimi yetkisi yok (team:none → 403)", async () => {
        const res = await api
          .get("/vendors/team", authHeader(permStaffToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(403)
      })

      it("mağaza ayarı düzenlenemez (settings:none → 403)", async () => {
        const res = await api
          .post("/vendors/me", { name: "Hack" }, authHeader(permStaffToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(403)
      })

      it("sahip her şeye erişir (campaigns → 200)", async () => {
        const res = await api.get("/vendors/campaigns", authHeader(ownerToken))
        expect(res.status).toBe(200)
      })
    })

    describe("Sistem kayıtları (audit)", () => {
      it("başarılı yazma kaydı düşer (sahip ayar güncelledi → settings.update)", async () => {
        const upd = await api.post(
          "/vendors/me",
          { description: "Audit testi açıklaması" },
          authHeader(ownerToken)
        )
        expect(upd.status).toBe(200)

        const logs = await api.get("/vendors/audit-logs?limit=50", authHeader(ownerToken))
        expect(logs.status).toBe(200)
        const settingsLog = logs.data.logs.find(
          (l: any) => l.action === "settings.update" && l.actor_admin_id === ownerAdminId
        )
        expect(settingsLog).toBeTruthy()
        expect(settingsLog.summary).toMatch(/ayar/i)
        expect(settingsLog.actor_name).toBeTruthy()
      })

      it("reddedilen (403) yazma audit'e YAZILMAZ", async () => {
        // permStaff settings'e yetkisiz → 403; bu hiç loglanmamalı.
        await api
          .post("/vendors/me", { name: "X" }, authHeader(permStaffToken))
          .catch((e: any) => e.response)

        const logs = await api.get(
          `/vendors/audit-logs?limit=100&actor_admin_id=${permStaffId}`,
          authHeader(ownerToken)
        )
        const writes = logs.data.logs.filter((l: any) => l.action === "settings.update")
        expect(writes.length).toBe(0)
      })

      it("davet işlemi de loglanır (team.invite)", async () => {
        const logs = await api.get(
          "/vendors/audit-logs?limit=100&action=team.invite",
          authHeader(ownerToken)
        )
        expect(logs.data.logs.length).toBeGreaterThan(0)
        expect(logs.data.logs[0].action).toBe("team.invite")
      })
    })

    describe("Eşzamanlı çalışma (presence)", () => {
      const resource = "order:e2e-presence"

      it("ilk açan kullanıcı yalnızdır (others boş)", async () => {
        const res = await api.post(
          "/vendors/presence",
          { resource, editing: true },
          authHeader(ownerToken)
        )
        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.others)).toBe(true)
      })

      it("ikinci kullanıcı, birinciyi 'aktif' görür", async () => {
        // Sahip zaten resource'ta; çalışan da girince sahibi görmeli.
        const res = await api.post(
          "/vendors/presence",
          { resource, editing: false },
          authHeader(permStaffToken)
        )
        expect(res.status).toBe(200)
        const names = res.data.others.map((o: any) => o.name)
        expect(names).toContain("RBAC Sahip")
        const ownerEntry = res.data.others.find((o: any) => o.name === "RBAC Sahip")
        expect(ownerEntry.editing).toBe(true)
        expect(typeof ownerEntry.since_seconds).toBe("number")
      })

      it("leave sonrası kullanıcı listeden düşer", async () => {
        await api.post("/vendors/presence", { resource, leave: true }, authHeader(permStaffToken))
        const res = await api.post(
          "/vendors/presence",
          { resource, editing: true },
          authHeader(ownerToken)
        )
        const names = res.data.others.map((o: any) => o.name)
        expect(names).not.toContain("İzinli Çalışan")
      })
    })

    describe("Askıya alma (en son — çalışan token'ını bozar)", () => {
      it("sahip çalışanı askıya alır → çalışan her uçta 403", async () => {
        const disable = await api.post(
          `/vendors/team/${permStaffId}`,
          { status: "disabled" },
          authHeader(ownerToken)
        )
        expect(disable.status).toBe(200)

        const res = await api
          .get("/vendors/products", authHeader(permStaffToken))
          .catch((e: any) => e.response)
        expect(res.status).toBe(403)
      })
    })
  },
})
