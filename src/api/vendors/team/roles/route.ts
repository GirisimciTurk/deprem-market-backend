import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ROLE_TEMPLATES, PERMISSION_SECTIONS } from "../../../../lib/seller-permissions"

/**
 * GET /vendors/team/roles — hazır rol şablonları + izin bölüm tanımları.
 * Panel, çalışan ekleme/düzenleme ekranını bunlara göre çizer.
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  return res.json({ roles: ROLE_TEMPLATES, sections: PERMISSION_SECTIONS })
}
