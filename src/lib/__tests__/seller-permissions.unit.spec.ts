import {
  levelFor,
  can,
  requiredPermissionFor,
  ROLE_TEMPLATES,
  PERMISSION_KEYS,
  PERMISSION_SECTIONS,
} from "../seller-permissions"

describe("seller-permissions: levelFor / can", () => {
  it("sahip (is_owner) her bölümde full sayılır", () => {
    const owner = { is_owner: true, permissions: { products: "none" as const } }
    expect(levelFor(owner, "products")).toBe("full")
    expect(levelFor(owner, "team")).toBe("full")
    expect(can(owner, "campaigns", "full")).toBe(true)
  })

  it("permissions === null → geriye dönük uyumluluk: full", () => {
    const legacy = { is_owner: false, permissions: null }
    expect(levelFor(legacy, "orders")).toBe("full")
    expect(can(legacy, "orders", "full")).toBe(true)
  })

  it("çalışan yalnız verilen bölümlerde yetkili; eksik anahtar = none", () => {
    const staff = { is_owner: false, permissions: { products: "full" as const, orders: "view" as const } }
    expect(levelFor(staff, "products")).toBe("full")
    expect(levelFor(staff, "orders")).toBe("view")
    expect(levelFor(staff, "campaigns")).toBe("none") // haritada yok
    expect(can(staff, "products", "full")).toBe(true)
    expect(can(staff, "orders", "full")).toBe(false) // sadece view
    expect(can(staff, "orders", "view")).toBe(true)
    expect(can(staff, "campaigns", "view")).toBe(false)
  })

  it("null/undefined admin → hiçbir yetki yok", () => {
    expect(can(null, "products", "view")).toBe(false)
    expect(can(undefined, "products", "view")).toBe(false)
    expect(levelFor(null, "products")).toBe("none")
  })

  it("varsayılan min seviyesi 'view'", () => {
    const staff = { is_owner: false, permissions: { products: "view" as const } }
    expect(can(staff, "products")).toBe(true) // view yeterli
  })
})

describe("seller-permissions: requiredPermissionFor (route → izin)", () => {
  it("iş bölümleri: GET → view, yazma → full", () => {
    expect(requiredPermissionFor("GET", "/vendors/products")).toEqual({ section: "products", level: "view" })
    expect(requiredPermissionFor("POST", "/vendors/products")).toEqual({ section: "products", level: "full" })
    expect(requiredPermissionFor("DELETE", "/vendors/products/prod_1")).toEqual({ section: "products", level: "full" })
    expect(requiredPermissionFor("GET", "/vendors/campaigns")).toEqual({ section: "campaigns", level: "view" })
    expect(requiredPermissionFor("POST", "/vendors/orders/o_1/fulfill")).toEqual({ section: "orders", level: "full" })
  })

  it("conversations → messages, audit-logs → audit_log, team → team", () => {
    expect(requiredPermissionFor("GET", "/vendors/conversations")).toEqual({ section: "messages", level: "view" })
    expect(requiredPermissionFor("GET", "/vendors/audit-logs")).toEqual({ section: "audit_log", level: "view" })
    expect(requiredPermissionFor("POST", "/vendors/team")).toEqual({ section: "team", level: "full" })
  })

  it("me: GET serbest (bootstrap), POST → settings:full", () => {
    expect(requiredPermissionFor("GET", "/vendors/me")).toBeNull()
    expect(requiredPermissionFor("POST", "/vendors/me")).toEqual({ section: "settings", level: "full" })
  })

  it("bootstrap/serbest uçlar → null (kontrol atlanır)", () => {
    expect(requiredPermissionFor("GET", "/vendors/stats")).toBeNull()
    expect(requiredPermissionFor("GET", "/vendors/notifications")).toBeNull()
    expect(requiredPermissionFor("POST", "/vendors/contracts/c_1/accept")).toBeNull()
    expect(requiredPermissionFor("GET", "/vendors/categories")).toBeNull()
    expect(requiredPermissionFor("POST", "/vendors/uploads")).toBeNull()
  })

  it("query string yolu bozmaz", () => {
    expect(requiredPermissionFor("GET", "/vendors/products?limit=20&q=x")).toEqual({ section: "products", level: "view" })
  })

  it("eşlenmemiş/bilinmeyen segment → null (serbest, oturum yine gerekir)", () => {
    expect(requiredPermissionFor("POST", "/vendors/bilinmeyen-uc")).toBeNull()
    expect(requiredPermissionFor("GET", "/vendors")).toBeNull()
  })
})

describe("seller-permissions: rol şablonları", () => {
  it("tüm şablonlar her bölüm için bir seviye içerir", () => {
    for (const tpl of ROLE_TEMPLATES) {
      for (const key of PERMISSION_KEYS) {
        expect(["none", "view", "full"]).toContain(tpl.permissions[key])
      }
    }
  })

  it("depo (warehouse): ürün/sipariş/iade full, kampanya none", () => {
    const depo = ROLE_TEMPLATES.find((r) => r.key === "warehouse")!
    expect(depo.permissions.products).toBe("full")
    expect(depo.permissions.orders).toBe("full")
    expect(depo.permissions.returns).toBe("full")
    expect(depo.permissions.campaigns).toBe("none")
    expect(depo.permissions.earnings).toBe("none")
  })

  it("muhasebe: kazanç/fatura görür, ürün düzenleyemez", () => {
    const acc = ROLE_TEMPLATES.find((r) => r.key === "accounting")!
    expect(acc.permissions.earnings).toBe("view")
    expect(acc.permissions.invoices).toBe("full")
    expect(acc.permissions.products).toBe("none")
  })

  it("müdür (manager) ekip dahil her şeye full", () => {
    const mgr = ROLE_TEMPLATES.find((r) => r.key === "manager")!
    expect(mgr.permissions.products).toBe("full")
    expect(mgr.permissions.team).toBe("full")
  })

  it("custom rolü tüm bölümlerde none", () => {
    const custom = ROLE_TEMPLATES.find((r) => r.key === "custom")!
    for (const key of PERMISSION_KEYS) expect(custom.permissions[key]).toBe("none")
  })

  it("PERMISSION_SECTIONS ile PERMISSION_KEYS tutarlı", () => {
    expect(PERMISSION_KEYS).toEqual(PERMISSION_SECTIONS.map((s) => s.key))
    expect(PERMISSION_KEYS).toContain("team")
    expect(PERMISSION_KEYS).toContain("audit_log")
  })
})
