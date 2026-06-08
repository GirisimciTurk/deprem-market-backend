import { model } from "@medusajs/framework/utils"

const StorefrontSetting = model.define("storefront_setting", {
  id: model.id().primaryKey(),
  key: model.text().unique(),
  value: model.json(),
})

export default StorefrontSetting
