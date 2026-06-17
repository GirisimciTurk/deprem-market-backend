import { MedusaService } from "@medusajs/framework/utils"
import ServiceRequest from "./models/service-request"

/**
 * Özel hizmet taleplerini yöneten modül servisi. MedusaService temel CRUD'u
 * (list/create/update/retrieve/delete) otomatik üretir; durum geçişleri ve
 * teklif/atama gibi iş akışları API/workflow katmanında yürütülür.
 */
class ServiceRequestModuleService extends MedusaService({
  ServiceRequest,
}) {}

export default ServiceRequestModuleService
