/**
 * depremTek Market bildirim e-postaları için ortak HTML iskeleti.
 * Başlık şeridi + içerik + altbilgi tüm mail'lerde aynıdır; yalnızca
 * `subtitle` (şerit alt yazısı), `accent` (vurgu rengi) ve `heading`/`body` değişir.
 */
export function emailShell(opts: {
  heading: string
  accent: string
  subtitle: string
  body: string
}): string {
  const { heading, accent, subtitle, body } = opts
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="font-family:'Segoe UI',Tahoma,sans-serif;background:#f8fafc;margin:0;padding:0;color:#1e293b;">
    <table align="center" width="600" style="background:#fff;margin:40px auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:28px;text-align:center;border-bottom:4px solid ${accent};">
        <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;text-transform:uppercase;">DEPREMTEK MARKET</h1>
        <p style="color:#94a3b8;margin:5px 0 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${subtitle}</p>
      </td></tr>
      <tr><td style="padding:36px 30px;">
        <h2 style="font-size:19px;font-weight:700;margin:0 0 16px;color:${accent};">${heading}</h2>
        ${body}
      </td></tr>
      <tr><td style="background:#f8fafc;padding:22px 30px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
        Bu e-posta depremTek Market tarafından otomatik gönderilmiştir. | bilgi@girisimciturk.com
      </td></tr>
    </table>
  </body></html>`
}
