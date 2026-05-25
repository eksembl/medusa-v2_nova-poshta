import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import NovaPoshtaService from "../../../../modules/novaposhta/service"
import {
  parseOrThrow,
  webhookPayloadSchema,
} from "../../../../modules/novaposhta/schemas"
import type { FulfillmentProviderData } from "../../../../modules/novaposhta/types"
import { NovaPoshtaError, NovaPoshtaErrorCode } from "../../../../modules/novaposhta/errors"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service = req.scope.resolve("novaposhta") as NovaPoshtaService
    const secret = req.headers["x-novaposhta-webhook-secret"] as
      | string
      | undefined

    if (!service.validateWebhookSecret(secret)) {
      return res.status(401).json({ message: "Invalid webhook secret" })
    }

    const payload = parseOrThrow(
      webhookPayloadSchema,
      req.body,
      "Webhook payload"
    )

    const fulfillmentModule = req.scope.resolve(Modules.FULFILLMENT)

    let fulfillment: { id: string; data?: Record<string, unknown> } | null =
      null

    if (payload.fulfillment_id) {
      fulfillment = await fulfillmentModule.retrieveFulfillment(
        payload.fulfillment_id
      )
    } else {
      const fulfillments = await fulfillmentModule.listFulfillments(
        {},
        { take: 100 }
      )

      fulfillment =
        fulfillments.find(
          (f: { data?: Record<string, unknown> }) =>
            (f.data as FulfillmentProviderData)?.ttn === payload.ttn
        ) ?? null
    }

    if (!fulfillment) {
      throw new NovaPoshtaError(
        `Fulfillment not found for TTN ${payload.ttn}`,
        NovaPoshtaErrorCode.NOT_FOUND
      )
    }

    const currentData = (fulfillment.data ?? {}) as FulfillmentProviderData
    const updatedData = service.applyWebhookStatus(
      currentData,
      payload.status,
      payload.status_code
    )

    await fulfillmentModule.updateFulfillment(fulfillment.id, {
      data: {
        ...updatedData,
        ...(payload.metadata ?? {}),
      },
    })

    return res.json({
      ok: true,
      fulfillment_id: fulfillment.id,
      ttn: payload.ttn,
      status: payload.status,
    })
  } catch (error) {
    if (error instanceof NovaPoshtaError) {
      const status =
        error.code === NovaPoshtaErrorCode.NOT_FOUND ? 404 : 400
      return res.status(status).json({
        type: error.code,
        message: error.message,
      })
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    return res.status(500).json({ message })
  }
}
