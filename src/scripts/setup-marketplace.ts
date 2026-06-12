import { MedusaContainer } from "@medusajs/framework"
import { runMarketplaceSetup } from "../lib/marketplace-setup"

/**
 * Pazar yeri başlangıç kurulumu (idempotent). Lokal: `npm run setup:marketplace`.
 * Prod'da imajda script kaynağı olmadığı için POST /admin/marketplace-setup kullanılır
 * (ikisi de lib/marketplace-setup.ts'i çağırır).
 */
export default async function setupMarketplace({ container }: { container: MedusaContainer }) {
  await runMarketplaceSetup(container)
}
