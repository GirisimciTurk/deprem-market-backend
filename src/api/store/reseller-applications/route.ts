import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { RESELLER_MODULE } from "../../../modules/reseller"
import ResellerModuleService from "../../../modules/reseller/service"
import { resellerLimiter, enforceRateLimit } from "../../../lib/rate-limiter"
import { notifyAdmins } from "../../../lib/notify"

const schema = z.object({
  company_name: z.string().min(1, "Firma adı zorunlu"),
  applicant_name: z.string().optional(),
  email: z.string().email("Geçerli bir e-posta girin"),
  phone: z.string().optional(),
  city: z.string().optional(),
  tax_number: z.string().optional(),
  message: z.string().optional(),
  // "bayi" (bayilik) | "firma" (kurumsal iş ortaklığı). Gönderilmezse bayi sayılır.
  application_type: z.enum(["bayi", "firma"]).optional(),
})

/** POST /store/reseller-applications — herkese açık bayilik başvurusu. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(resellerLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz başvuru.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const appType = d.application_type ?? "bayi"
  const isFirma = appType === "firma"
  const reseller: ResellerModuleService = req.scope.resolve(RESELLER_MODULE)

  const application = await reseller.createResellerApplications({
    application_type: appType,
    company_name: d.company_name,
    applicant_name: d.applicant_name ?? "",
    email: d.email,
    phone: d.phone ?? "",
    city: d.city ?? "",
    tax_number: d.tax_number ?? "",
    message: d.message ?? "",
    status: "pending",
  })

  await notifyAdmins(req.scope, {
    type: "reseller_application",
    title: isFirma ? "Yeni firma başvurusu" : "Yeni bayilik başvurusu",
    body: `${d.company_name}${d.city ? ` — ${d.city}` : ""}`,
    link: isFirma ? "/resellers?type=firma" : "/resellers",
  })

  return res.status(201).json({ application: { id: application.id, status: application.status } })
}
