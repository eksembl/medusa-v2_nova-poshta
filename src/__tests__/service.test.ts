import { describe, it, expect, vi, beforeEach } from "vitest"
import NovaPoshtaService from "../modules/novaposhta/service"
import { NovaPoshtaError, NovaPoshtaErrorCode } from "../modules/novaposhta/errors"

const validOptions = {
  apiKey: "test-key",
  senderRef: "sender",
  senderCityRef: "city-sender",
  contactRef: "contact",
  phone: "380501234567",
}

describe("NovaPoshtaService", () => {
  let service: NovaPoshtaService

  beforeEach(() => {
    service = new NovaPoshtaService({}, validOptions)
  })

  it("validates fulfillment data", async () => {
    const result = await service.validateFulfillmentData(
      { id: "novaposhta_warehouse" },
      { city_ref: "city-1", warehouse_ref: "wh-1" },
      {}
    )
    expect(result.city_ref).toBe("city-1")
  })

  it("rejects webhook without secret when configured", () => {
    const secured = new NovaPoshtaService({}, {
      ...validOptions,
      webhookSecret: "secret",
    })
    expect(secured.validateWebhookSecret("wrong")).toBe(false)
    expect(secured.validateWebhookSecret("secret")).toBe(true)
  })

  it("maps tracking updates", () => {
    const update = service.mapTrackingToFulfillmentUpdate({
      Status: "In transit",
      StatusCode: "5",
    })
    expect(update.tracking_status).toBe("In transit")
    expect(update.tracking_status_code).toBe("5")
  })

  it("detects delivered status codes", () => {
    expect(service.isDelivered("9")).toBe(true)
    expect(service.isDelivered("1")).toBe(false)
  })

  it("throws when createFulfillment has no phone", async () => {
    await expect(
      service.createFulfillment(
        { city_ref: "c", warehouse_ref: "w" },
        [],
        { shipping_address: { first_name: "A", last_name: "B" } },
        {}
      )
    ).rejects.toBeInstanceOf(NovaPoshtaError)
  })

  it("createFulfillment returns labels with tracking", async () => {
    vi.spyOn(service["client"], "createTTN").mockResolvedValue([
      { IntDocNumber: "20450000000001", Ref: "ref-1" },
    ])

    const result = await service.createFulfillment(
      { city_ref: "city-1", warehouse_ref: "wh-1" },
      [{ quantity: 1, weight: 500 }],
      {
        display_id: 100,
        total: 1000,
        shipping_address: {
          first_name: "John",
          last_name: "Doe",
          phone: "380501234567",
        },
      },
      {}
    )

    expect(result.data.ttn).toBe("20450000000001")
    expect(result.labels[0].tracking_number).toBe("20450000000001")
    expect(result.labels[0].tracking_url).toContain("20450000000001")
  })
})
