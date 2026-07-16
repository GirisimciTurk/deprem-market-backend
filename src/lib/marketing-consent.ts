import { Modules } from "@medusajs/framework/utils"

/**
 * Pazarlama e-postası izni (KVKK). İzin müşteri `metadata.comm_email` alanında
 * tutulur (storefront "İletişim Tercihleri"). Varsayılan: açık (opt-in); YALNIZ
 * müşteri açıkça `comm_email === false` yaptıysa e-posta gönderilmez.
 *
 * Not: Misafir (customer_id olmayan) alıcının bir opt-out kaydı yoktur; onlar bu
 * fonksiyonla filtrelenmez (aktif checkout'ta e-postalarını kendileri girmiştir).
 */
export async function listEmailOptedInCustomerIds(
  container: any,
  customerIds: string[]
): Promise<Set<string>> {
  const allowed = new Set<string>()
  const ids = customerIds.filter(Boolean)
  if (ids.length === 0) return allowed
  try {
    const customerModule = container.resolve(Modules.CUSTOMER)
    const customers = await customerModule.listCustomers(
      { id: ids },
      { select: ["id", "metadata"] }
    )
    for (const c of customers) {
      if ((c.metadata as any)?.comm_email !== false) allowed.add(c.id)
    }
  } catch {
    // Sorgu hatasında güvenli taraf: kimseyi engelleme (opt-in varsayımı korunur).
    for (const id of ids) allowed.add(id)
  }
  return allowed
}

/** Tek müşteri için e-posta izni. Misafir (id yok) → izinli sayılır. */
export async function canEmailCustomerId(
  container: any,
  customerId?: string | null
): Promise<boolean> {
  if (!customerId) return true
  const allowed = await listEmailOptedInCustomerIds(container, [customerId])
  return allowed.has(customerId)
}
