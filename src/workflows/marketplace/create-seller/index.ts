import {
  createWorkflow,
  WorkflowResponse,
  when,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { createSellerStep, CreateSellerStepInput } from "./steps/create-seller"

type CreateSellerWorkflowInput = CreateSellerStepInput & {
  // Self-service kayıtta auth identity'yi satıcı kullanıcısına bağlamak için.
  auth_identity_id?: string
}

export const createSellerWorkflow = createWorkflow(
  "create-seller",
  (input: CreateSellerWorkflowInput) => {
    const result = createSellerStep(input)

    // Yalnız self-service kayıtta (auth_identity_id varsa) auth kimliğini satıcı
    // kullanıcısına bağla → satıcı paneli login'i çalışır.
    when(input, (i) => !!i.auth_identity_id).then(() => {
      setAuthAppMetadataStep({
        authIdentityId: input.auth_identity_id!,
        actorType: "seller",
        value: result.adminId!,
      })
    })

    return new WorkflowResponse(result)
  }
)
