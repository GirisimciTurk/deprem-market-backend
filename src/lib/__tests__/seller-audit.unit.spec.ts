import { describeVendorAction, entityIdFromPath } from "../seller-audit"

describe("seller-audit: describeVendorAction (yol → Türkçe aksiyon)", () => {
  const cases: Array<[string, string, string]> = [
    // [method, path, beklenen action]
    ["POST", "/vendors/products", "product.create"],
    ["POST", "/vendors/products/prod_1", "product.update"],
    ["DELETE", "/vendors/products/prod_1", "product.delete"],
    ["POST", "/vendors/products/bulk", "product.bulk"],
    ["POST", "/vendors/campaigns", "campaign.create"],
    ["POST", "/vendors/campaigns/c_1", "campaign.update"],
    ["DELETE", "/vendors/campaigns/c_1", "campaign.delete"],
    ["POST", "/vendors/returns/r_1/receive", "return.receive"],
    ["POST", "/vendors/returns/r_1/reject", "return.reject"],
    ["POST", "/vendors/orders/o_1/fulfill", "order.fulfill"],
    ["POST", "/vendors/questions/q_1/answer", "question.answer"],
    ["POST", "/vendors/conversations/cv_1/messages", "message.send"],
    ["POST", "/vendors/invoices/i_1/mark-issued", "invoice.issue"],
    ["POST", "/vendors/contracts/ct_1/accept", "contract.accept"],
    ["POST", "/vendors/me", "settings.update"],
    ["POST", "/vendors/team", "team.invite"],
    ["POST", "/vendors/team/sa_1", "team.update"],
    ["POST", "/vendors/team/sa_1/reset-password", "team.reset_password"],
    ["DELETE", "/vendors/team/sa_1", "team.remove"],
  ]

  it.each(cases)("%s %s → action %s", (method, path, expected) => {
    expect(describeVendorAction(method, path).action).toBe(expected)
  })

  it("özet (summary) Türkçe ve dolu", () => {
    expect(describeVendorAction("POST", "/vendors/products").summary).toMatch(/ürün/i)
    expect(describeVendorAction("POST", "/vendors/team/sa_1/reset-password").summary).toMatch(/şifre/i)
    expect(describeVendorAction("POST", "/vendors/orders/o_1/fulfill").summary).toMatch(/kargo/i)
  })

  it("entity_type ilk segmentten türetilir", () => {
    expect(describeVendorAction("POST", "/vendors/products").entityType).toBe("product")
    expect(describeVendorAction("POST", "/vendors/campaigns").entityType).toBe("campaign")
    expect(describeVendorAction("POST", "/vendors/team").entityType).toBe("seller_admin")
  })

  it("bilinmeyen segment için makul varsayılan üretir", () => {
    const d = describeVendorAction("POST", "/vendors/garip-uc")
    expect(d.action).toBe("garip-uc.post")
    expect(d.summary).toContain("POST")
  })
})

describe("seller-audit: entityIdFromPath", () => {
  it("/<seg>/<id> kalıbından id ayıklar", () => {
    expect(entityIdFromPath("/vendors/products/prod_1")).toBe("prod_1")
    expect(entityIdFromPath("/vendors/orders/o_1/fulfill")).toBe("o_1")
    expect(entityIdFromPath("/vendors/team/sa_1/reset-password")).toBe("sa_1")
  })

  it("id yoksa null", () => {
    expect(entityIdFromPath("/vendors/products")).toBeNull()
    expect(entityIdFromPath("/vendors/me")).toBeNull()
  })

  it("bulk özel: id sayılmaz", () => {
    expect(entityIdFromPath("/vendors/products/bulk")).toBeNull()
  })

  it("query string id'yi bozmaz", () => {
    expect(entityIdFromPath("/vendors/products/prod_1?x=1")).toBe("prod_1")
  })
})
