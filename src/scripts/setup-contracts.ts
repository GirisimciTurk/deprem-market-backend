import { runContractSetup } from "../lib/contract-setup"

/** `npx medusa exec ./src/scripts/setup-contracts.ts` — satıcı sözleşmelerini kurar (idempotent). */
export default async function setupContracts({ container }: { container: any }) {
  const result = await runContractSetup(container)
  console.log("[setup-contracts]", JSON.stringify(result, null, 2))
}
