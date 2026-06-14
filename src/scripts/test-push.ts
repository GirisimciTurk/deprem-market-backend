import { ExecArgs } from "@medusajs/framework/types"
import { broadcast } from "../lib/web-push"
import { PUSH_MODULE } from "../modules/push"
import type PushModuleService from "../modules/push/service"

/**
 * Geliştirici testi: mevcut tüm abonelere bir test bildirimi yayınlar ve
 * sonucu (total/sent) ile temizleme davranışını gösterir.
 *
 * Çalıştırma: npx medusa exec ./src/scripts/test-push.ts
 *
 * Sahte/geçersiz endpoint'ler push servisinden 404/410 alır → otomatik silinir;
 * çıktıdaki "kalan abonelik" sayısı bunu doğrular. Gerçek bir tarayıcı aboneliği
 * varsa sent>0 olur ve cihaza bildirim düşer.
 */
export default async function testPush({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const push = container.resolve(PUSH_MODULE) as PushModuleService

  const before = await push.listPushSubscriptions({}, { take: null })
  logger.info(`[test-push] Gönderim öncesi abonelik sayısı: ${before.length}`)

  const result = await broadcast(container, {
    title: "Deprem Market — Test",
    body: "Bu bir web push test bildirimidir. ✅",
    url: "/tr",
    tag: "test",
  })
  logger.info(
    `[test-push] BROADCAST sonucu → total=${result.total}, sent=${result.sent}`
  )

  const after = await push.listPushSubscriptions({}, { take: null })
  logger.info(
    `[test-push] Gönderim sonrası abonelik sayısı: ${after.length} (geçersizler temizlendi)`
  )
}
