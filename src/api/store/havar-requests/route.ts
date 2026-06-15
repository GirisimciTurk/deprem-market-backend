import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { HAVAR_MODULE } from "../../../modules/havar"
import HavarModuleService from "../../../modules/havar/service"
import { resellerLimiter, enforceRateLimit } from "../../../lib/rate-limiter"
import { notifyAdmins } from "../../../lib/notify"

const schema = z.object({
  type: z.enum(["purchase", "rental"]),
  full_name: z.string().trim().min(1, "Ad soyad zorunlu").max(160),
  email: z.string().email("Geçerli bir e-posta girin"),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  buyer_type: z.enum(["individual", "family"]).optional(),
  usage: z.enum(["cargo", "human", "both"]).optional(),
  quantity: z.coerce.number().int().min(1).max(999).optional(),
  want_door_mechanism: z.coerce.boolean().optional(),
  rental_duration: z.string().trim().max(80).optional(),
  note: z.string().trim().max(2000).optional(),
})

/**
 * POST /store/havar-requests — HAVAR (drone) ön alım / ön kiralama talebi (public).
 * type=purchase (Satın Al) | rental (Kiralama). Admin'e bildirim gider.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (await enforceRateLimit(resellerLimiter, req, res)) return

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Geçersiz talep.", issues: parsed.error.issues })
  }
  const d = parsed.data
  const havar: HavarModuleService = req.scope.resolve(HAVAR_MODULE)

  const request = await havar.createHavarRequests({
    type: d.type,
    full_name: d.full_name,
    email: d.email,
    phone: d.phone ?? "",
    city: d.city ?? "",
    buyer_type: d.buyer_type ?? "individual",
    usage: d.usage ?? "both",
    quantity: d.quantity ?? 1,
    want_door_mechanism: d.want_door_mechanism ?? false,
    rental_duration: d.rental_duration ?? "",
    note: d.note ?? "",
    status: "pending",
  })

  await notifyAdmins(req.scope, {
    type: "havar_request",
    title: d.type === "rental" ? "Yeni HAVAR ön kiralama talebi" : "Yeni HAVAR ön alım talebi",
    body: `${d.full_name}${d.city ? ` — ${d.city}` : ""}${d.want_door_mechanism ? " · kapı mekanizması" : ""}`,
    link: "/havar-requests",
  })

  return res.status(201).json({ request: { id: request.id, type: request.type } })
}
