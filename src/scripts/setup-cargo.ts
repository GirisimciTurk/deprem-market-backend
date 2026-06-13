import { MedusaContainer } from "@medusajs/framework"
import { runCargoSetup } from "../lib/cargo-setup"

/**
 * Yurtiçi Kargo altyapısını kurar (idempotent). Asıl mantık lib/cargo-setup.ts'te
 * (POST /admin/cargo-setup endpoint'i de aynı lib'i çağırır).
 *
 * Çalıştırma:  npm run setup:cargo
 */
export default async function setupCargo({ container }: { container: MedusaContainer }) {
  await runCargoSetup(container)
}
