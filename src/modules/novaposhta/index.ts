import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import NovaPoshtaService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [NovaPoshtaService],
})
