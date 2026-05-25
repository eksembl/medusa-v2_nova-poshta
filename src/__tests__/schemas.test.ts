import { describe, it, expect } from "vitest"
import {
  fulfillmentDataSchema,
  novaPoshtaOptionsSchema,
  webhookPayloadSchema,
  parseOrThrow,
} from "../modules/novaposhta/schemas"

describe("schemas", () => {
  it("validates module options", () => {
    const result = novaPoshtaOptionsSchema.safeParse({
      apiKey: "key",
      senderRef: "s",
      senderCityRef: "c",
      contactRef: "ct",
      phone: "380501234567",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid fulfillment data", () => {
    const result = fulfillmentDataSchema.safeParse({ city_ref: "" })
    expect(result.success).toBe(false)
  })

  it("parses webhook payload", () => {
    const payload = parseOrThrow(
      webhookPayloadSchema,
      { ttn: "20450123456789", status: "Delivered" },
      "Webhook"
    )
    expect(payload.ttn).toBe("20450123456789")
  })
})
