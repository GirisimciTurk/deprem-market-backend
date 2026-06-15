import { MedusaContainer } from "@medusajs/framework/types"
import { RESELLER_MODULE } from "../modules/reseller"

/**
 * Saatlik temizlik işi: durumu "rejected" olan ve reddedilme tarihinin (rejected_at)
 * üzerinden 24 saat geçmiş bayilik başvurularını KALICI olarak siler.
 *
 * rejected_at, başvuru "rejected" yapıldığında damgalanır; başka bir duruma
 * (pending/approved/suspended) alınırsa null'lanır — yani durum red dışına
 * çıkarsa silme zamanlayıcısı iptal olur. $lte filtresi null'ları kapsamaz,
 * o yüzden yalnızca süresi dolmuş gerçek redler seçilir.
 */
const RETENTION_MS = 24 * 60 * 60 * 1000 // 24 saat

export default async function purgeRejectedApplicationsJob(container: MedusaContainer) {
  const logger = container.resolve("logger")
  const reseller: any = container.resolve(RESELLER_MODULE)
  const cutoff = new Date(Date.now() - RETENTION_MS)

  const stale = await reseller.listResellerApplications(
    { status: "rejected", rejected_at: { $lte: cutoff } },
    { take: 500 }
  )
  if (!stale.length) return

  const ids = stale.map((a: any) => a.id)
  try {
    await reseller.deleteResellerApplications(ids)
    logger.info(
      `[purge-rejected-applications] 24 saati dolmuş ${ids.length} reddedilmiş başvuru silindi.`
    )
  } catch (e: any) {
    logger.error(`[purge-rejected-applications] silme hatası: ${e?.message}`)
  }
}

export const config = {
  name: "purge-rejected-applications-hourly",
  schedule: "0 * * * *", // her saat başı
}
