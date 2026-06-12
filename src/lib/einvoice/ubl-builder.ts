/**
 * UBL-TR taslak veri üreticisi. Tam UBL-XML üretmez (onu genelde entegratör yapar);
 * entegratöre verilecek yapılandırılmış fatura verisini + KDV kırılımını üretir.
 *
 * Tüm tutarlar minor unit (kuruş) GİRER ve minor unit DÖNER. Satır tutarları
 * KDV DAHİL (brüt) kabul edilir (TR perakende konvansiyonu); net + KDV geri hesaplanır.
 */

export type UblParty = {
  name: string
  taxNumber?: string // VKN (10 hane) veya TCKN (11 hane)
  taxOffice?: string
  address?: string
  email?: string
}

export type UblLineInput = {
  name: string
  quantity: number
  grossUnitPrice: number // KDV dahil birim fiyat (kuruş)
}

export type UblLine = {
  name: string
  quantity: number
  unit_price_gross: number
  line_gross: number
  line_net: number
  line_kdv: number
  kdv_rate: number
}

export type BuiltInvoice = {
  net_total: number
  tax_total: number
  grand_total: number
  lines: UblLine[]
  ubl_payload: Record<string, unknown>
}

const round = (n: number) => Math.round(n)

export function buildInvoiceData(opts: {
  type: "sale" | "commission"
  profile: "EARSIVFATURA" | "TICARIFATURA"
  issuer: UblParty
  recipient: UblParty
  lines: UblLineInput[]
  kdvRate: number
  currency: string
  issueDate: Date
  draftNumber: string
}): BuiltInvoice {
  const rate = opts.kdvRate
  const lines: UblLine[] = opts.lines.map((l) => {
    const lineGross = l.grossUnitPrice * l.quantity
    const lineNet = round(lineGross / (1 + rate / 100))
    const lineKdv = lineGross - lineNet
    return {
      name: l.name,
      quantity: l.quantity,
      unit_price_gross: l.grossUnitPrice,
      line_gross: lineGross,
      line_net: lineNet,
      line_kdv: lineKdv,
      kdv_rate: rate,
    }
  })

  const net_total = lines.reduce((s, l) => s + l.line_net, 0)
  const tax_total = lines.reduce((s, l) => s + l.line_kdv, 0)
  const grand_total = lines.reduce((s, l) => s + l.line_gross, 0)

  // Minor → major (kuruş → TL) UBL için.
  const toMajor = (minor: number) => (minor / 100).toFixed(2)

  const party = (p: UblParty) => ({
    Name: p.name,
    ...(p.taxNumber
      ? { [p.taxNumber.length === 11 ? "TCKN" : "VKN"]: p.taxNumber }
      : {}),
    ...(p.taxOffice ? { TaxOffice: p.taxOffice } : {}),
    ...(p.address ? { Address: p.address } : {}),
    ...(p.email ? { Email: p.email } : {}),
  })

  const ubl_payload: Record<string, unknown> = {
    InvoiceTypeCode: "SATIS",
    ProfileID: opts.profile,
    DocumentCurrencyCode: opts.currency.toUpperCase(),
    IssueDate: opts.issueDate.toISOString().slice(0, 10),
    DraftNumber: opts.draftNumber,
    Note: opts.type === "commission" ? "Pazar yeri komisyon faturası" : "Satış faturası",
    AccountingSupplierParty: party(opts.issuer),
    AccountingCustomerParty: party(opts.recipient),
    InvoiceLines: lines.map((l, i) => ({
      ID: i + 1,
      Name: l.name,
      Quantity: l.quantity,
      UnitCode: "C62", // adet
      LineExtensionAmount: toMajor(l.line_net),
      TaxAmount: toMajor(l.line_kdv),
      TaxPercent: l.kdv_rate,
      PriceAmount: toMajor(round(l.unit_price_gross / (1 + rate / 100))),
    })),
    TaxTotal: { TaxAmount: toMajor(tax_total), Percent: rate },
    LegalMonetaryTotal: {
      LineExtensionAmount: toMajor(net_total),
      TaxExclusiveAmount: toMajor(net_total),
      TaxInclusiveAmount: toMajor(grand_total),
      PayableAmount: toMajor(grand_total),
    },
  }

  return { net_total, tax_total, grand_total, lines, ubl_payload }
}
