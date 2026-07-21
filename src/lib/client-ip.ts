/**
 * Gerçek istemci IP'sinin güvenli çıkarımı.
 *
 * TEHDİT: `X-Forwarded-For` İSTEMCİ TARAFINDAN YAZILABİLİR bir başlıktır. nginx
 * yaygın `$proxy_add_x_forwarded_for` kalıbıyla gelen değeri EZMEZ, sonuna kendi
 * gördüğü IP'yi EKLER. Yani başlık şuna benzer:
 *
 *     X-Forwarded-For: <istemcinin uydurduğu>, <gerçek istemci IP>
 *                       ▲ saldırgan kontrolünde   ▲ nginx yazdı, güvenilir
 *
 * Bu yüzden `.split(",")[0]` almak SALDIRGANIN kontrolündeki değeri döndürür.
 * Hız sınırlayıcı buna göre anahtarlanırsa, istemci her istekte başlığı
 * değiştirerek tüm limitleri (giriş denemesi dahil) önemsiz şekilde aşar.
 * Aynı değer hukuki delil olarak saklanıyorsa (sözleşme kabulü) delil çürür.
 *
 * DOĞRUSU SAĞDAN SAYMAKTIR: zincirin en sağındaki girdileri bizim altyapımız
 * yazmıştır ve güvenilirdir; sola gidildikçe değerler istemci uydurmasıdır.
 *
 * TRUSTED_PROXY_COUNT = XFF'e ekleme yapan KENDİ vekillerimizin sayısı.
 *   1 (varsayılan) → önde tek nginx: son girdi gerçek istemcidir
 *   2              → ör. Cloudflare + nginx
 *   0              → doğrudan internete açık: XFF tamamen yok sayılır
 *
 * Yanlış ayarlamak güvenliği bozar: gereğinden BÜYÜK değer, istemci uydurmasını
 * güvenilir kabul etmeye geri döner. Vekil sayısı değişirse burayı güncelle.
 */

const TRUSTED_PROXY_COUNT = (() => {
  const raw = process.env.TRUSTED_PROXY_COUNT
  if (raw == null || raw.trim() === "") return 1
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1
})()

/** `::ffff:1.2.3.4` → `1.2.3.4`; varsa port'u at. */
function normalize(ip: string): string {
  const v = (ip || "").trim()
  if (!v) return ""
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return mapped[1]
  // IPv4:port (IPv6'da ':' anlamlı olduğu için yalnız IPv4 biçiminde ayır).
  const withPort = v.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/)
  if (withPort) return withPort[1]
  return v
}

type IpRequest = {
  headers: Record<string, unknown>
  socket?: { remoteAddress?: string | null } | null
}

/**
 * İstemci IP'si — hız limiti anahtarı ve denetim/delil kaydı için.
 * Belirlenemezse `"unknown_ip"` döner (çağıran taraf bunu tek kova gibi ele alır).
 */
export function getClientIp(req: IpRequest): string {
  const socketIp = normalize(req.socket?.remoteAddress ?? "")

  // Vekil yoksa XFF'e hiç bakma: TCP eşi zaten gerçek istemcidir.
  if (TRUSTED_PROXY_COUNT === 0) return socketIp || "unknown_ip"

  const raw = req.headers["x-forwarded-for"]
  const chain = (Array.isArray(raw) ? raw.join(",") : typeof raw === "string" ? raw : "")
    .split(",")
    .map((s) => normalize(s))
    .filter(Boolean)

  if (chain.length === 0) return socketIp || "unknown_ip"

  // Sağdan TRUSTED_PROXY_COUNT'uncu girdi = en son güvenilir vekilin YAZDIĞI değer.
  const index = chain.length - TRUSTED_PROXY_COUNT
  if (index < 0) {
    // Zincir beklenenden kısa (vekil sayısı yanlış ya da başlık kırpılmış):
    // uydurma değere düşmektense TCP eşine güven.
    return socketIp || chain[0] || "unknown_ip"
  }
  return chain[index] || socketIp || "unknown_ip"
}
