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
  kdvRate?: number // satır bazında KDV oranı (%); verilmezse opts.kdvRate kullanılır
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
  // KDV-DAHİL fiyatlar → GİB-kanonik "net-önce" ayrıştırma: net = round(gross*100/
  // (100+rate)), kdv = round(net*rate/100). Satır bazında KDV oranı (karışık destekli).
  const lines: UblLine[] = opts.lines.map((l) => {
    const lineRate = l.kdvRate != null && !Number.isNaN(Number(l.kdvRate)) ? Number(l.kdvRate) : opts.kdvRate
    const lineGross = l.grossUnitPrice * l.quantity
    const lineNet = round((lineGross * 100) / (100 + lineRate))
    const lineKdv = round((lineNet * lineRate) / 100)
    return {
      name: l.name,
      quantity: l.quantity,
      unit_price_gross: l.grossUnitPrice,
      line_gross: lineNet + lineKdv,
      line_net: lineNet,
      line_kdv: lineKdv,
      kdv_rate: lineRate,
    }
  })

  // Oran-grubu uzlaşımı: grup kanonik net/kdv = round(group_gross*100/(100+rate)) /
  // round(net*rate/100); satır yuvarlama artığı grubun EN BÜYÜK satırına eklenir.
  // Böylece her grupta Σline_net == group_net ve Σline_kdv == group_kdv ==
  // round(group_net*rate/100) — UBL TaxSubtotal GİB doğrulamasını EXACT geçer.
  const idxByRate = new Map<number, number[]>()
  lines.forEach((l, i) => {
    if (!idxByRate.has(l.kdv_rate)) idxByRate.set(l.kdv_rate, [])
    idxByRate.get(l.kdv_rate)!.push(i)
  })
  for (const [rate, idxs] of idxByRate) {
    const groupGross = idxs.reduce((s, i) => s + opts.lines[i].grossUnitPrice * opts.lines[i].quantity, 0)
    const groupNet = round((groupGross * 100) / (100 + rate))
    const groupKdv = round((groupNet * rate) / 100)
    const sumNet = idxs.reduce((s, i) => s + lines[i].line_net, 0)
    const sumKdv = idxs.reduce((s, i) => s + lines[i].line_kdv, 0)
    const largest = idxs.reduce((a, b) => (lines[a].line_net >= lines[b].line_net ? a : b))
    lines[largest].line_net += groupNet - sumNet
    lines[largest].line_kdv += groupKdv - sumKdv
    lines[largest].line_gross = lines[largest].line_net + lines[largest].line_kdv
  }

  const net_total = lines.reduce((s, l) => s + l.line_net, 0)
  const tax_total = lines.reduce((s, l) => s + l.line_kdv, 0)
  const grand_total = net_total + tax_total

  // Minor → major (kuruş → TL) UBL için.
  const toMajor = (minor: number) => (minor / 100).toFixed(2)

  // KDV oranı başına alt-toplam (uzlaşım sonrası tutarlar GİB ile birebir).
  const byRate = new Map<number, { taxable: number; tax: number }>()
  for (const l of lines) {
    const g = byRate.get(l.kdv_rate) || { taxable: 0, tax: 0 }
    g.taxable += l.line_net
    g.tax += l.line_kdv
    byRate.set(l.kdv_rate, g)
  }
  const taxSubtotals = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([percent, v]) => ({
      Percent: percent,
      TaxableAmount: toMajor(v.taxable),
      TaxAmount: toMajor(v.tax),
    }))

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
    // Yerel takvim günü (Europe/Istanbul) — UTC kesme gece yarısı–03:00 arası
    // faturayı bir önceki güne kaydırıyordu (yasal dönem/tarih hatası).
    IssueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(opts.issueDate),
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
      // Birim net fiyat line_net'ten türetilir (4 ondalık) → round(PriceAmount×Qty)
      // == LineExtensionAmount (GİB satır tutarlılığı; ayrı yuvarlama sapması yok).
      PriceAmount: l.quantity > 0 ? (l.line_net / l.quantity / 100).toFixed(4) : "0.0000",
    })),
    // Karışık KDV: oran başına alt-toplam (UBL TaxSubtotal). Tek oransa Percent de yazılır.
    TaxTotal: {
      TaxAmount: toMajor(tax_total),
      ...(taxSubtotals.length === 1 ? { Percent: taxSubtotals[0].Percent } : {}),
      TaxSubtotals: taxSubtotals,
    },
    LegalMonetaryTotal: {
      LineExtensionAmount: toMajor(net_total),
      TaxExclusiveAmount: toMajor(net_total),
      TaxInclusiveAmount: toMajor(grand_total),
      PayableAmount: toMajor(grand_total),
    },
  }

  return { net_total, tax_total, grand_total, lines, ubl_payload }
}
