import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import NovaPoshtaService from "../modules/novaposhta/service"
import type { FulfillmentProviderData } from "../modules/novaposhta/types"

export default async function syncNovaPoshtaTracking(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)

  let service: NovaPoshtaService
  try {
    service = container.resolve("novaposhta") as NovaPoshtaService
  } catch {
    logger.warn(
      "[novaposhta] sync job skipped: novaposhta service not registered"
    )
    return
  }

  const fulfillments = await fulfillmentModule.listFulfillments(
    { canceled_at: null },
    { take: 200 }
  )

  let synced = 0
  let failed = 0

  for (const fulfillment of fulfillments) {
    const data = fulfillment.data as FulfillmentProviderData | undefined
    if (!data?.ttn) {
      continue
    }

    if (fulfillment.delivered_at) {
      continue
    }

    try {
      const updated = await service.syncTrackingForFulfillment(data)
      if (!updated) {
        continue
      }

      const statusChanged =
        updated.tracking_status !== data.tracking_status ||
        String(updated.tracking_status_code) !==
          String(data.tracking_status_code)

      if (!statusChanged) {
        continue
      }

      await fulfillmentModule.updateFulfillment(fulfillment.id, {
        data: updated,
      })

      if (service.isDelivered(updated.tracking_status_code)) {
        await fulfillmentModule.updateFulfillment(fulfillment.id, {
          delivered_at: new Date(),
        })
      }

      synced++
      logger.info(
        `[novaposhta] synced tracking for fulfillment ${fulfillment.id}`,
        { ttn: data.ttn, status: updated.tracking_status }
      )
    } catch (error) {
      failed++
      logger.error(
        `[novaposhta] failed to sync fulfillment ${fulfillment.id}`,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  logger.info(
    `[novaposhta] tracking sync finished: ${synced} updated, ${failed} failed`
  )
}

export const config = {
  name: "sync-novaposhta-tracking",
  schedule: "*/30 * * * *",
}
