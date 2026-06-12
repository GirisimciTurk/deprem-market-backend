import { MedusaService } from "@medusajs/framework/utils"
import Invoice from "./models/invoice"

// Otomatik CRUD: createInvoices/listInvoices/retrieveInvoice/updateInvoices...
class InvoicingModuleService extends MedusaService({
  Invoice,
}) {}

export default InvoicingModuleService
