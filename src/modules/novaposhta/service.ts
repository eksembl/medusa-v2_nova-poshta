import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type {
  FulfillmentItemDTO,
  FulfillmentOrderDTO,
  FulfillmentDTO,
  Logger,
} from "@medusajs/framework/types"
import { NovaPoshtaClient } from "./client"
import { NP_TRACKING_URL } from "./constants"
import {
  NovaPoshtaError,
  NovaPoshtaErrorCode,
} from "./errors"
import {
  fulfillmentDataSchema,
  novaPoshtaOptionsSchema,
  parseOrThrow,
} from "./schemas"
import type {
  FulfillmentProviderData,
  NovaPoshtaOptions,
  TrackingStatus,
} from "./types"
import { DELIVERED_STATUS_CODES } from "./types"

type InjectedDependencies = {
  logger?: Logger
}

function calculateWeightKg(items: { quantity?: number; weight?: number }[]): string {
  const totalGrams = items.reduce((sum, item) => {
    const qty = Number(item.quantity ?? 1)
    const weight = Number(item.weight ?? 500)
    return sum + qty * weight
  }, 0)

  const kg = Math.max(0.1, totalGrams / 1000)
  return kg.toFixed(2)
}

function serviceTypeFromOption(serviceType?: string): string {
  return serviceType === "novaposhta_courier"
    ? "WarehouseDoors"
    : "WarehouseWarehouse"
}

class NovaPoshtaService extends AbstractFulfillmentProviderService {
  static identifier = "novaposhta"

  protected client: NovaPoshtaClient
  protected options: NovaPoshtaOptions
  protected logger_?: Logger

  constructor(
    { logger }: InjectedDependencies = {},
    options: NovaPoshtaOptions
  ) {
    super()

    this.logger_ = logger
    this.options = parseOrThrow(
      novaPoshtaOptionsSchema,
      options,
      "Nova Poshta options"
    )
    this.client = new NovaPoshtaClient(
      this.options.apiKey,
      this.options.cacheTtlMs
    )
  }

  private log(message: string, meta?: Record<string, unknown>) {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : ""
    this.logger_?.info(`[novaposhta] ${message}${suffix}`)
  }

  private logError(message: string, error: unknown) {
    const err =
      error instanceof Error ? error : new Error(String(error))
    this.logger_?.error(`[novaposhta] ${message}`, err)
  }

  async searchCities(query = "") {
    return this.client.getCities(query)
  }

  async listWarehouses(cityRef: string) {
    return this.client.getWarehouses(cityRef)
  }

  async getTrackingForTtn(ttn: string): Promise<TrackingStatus | null> {
    const statuses = await this.client.getTrackingStatus(ttn)
    return statuses?.[0] ?? null
  }

  async testConnection(): Promise<{ ok: boolean }> {
    await this.client.getCities("Київ")
    return { ok: true }
  }

  async getFulfillmentOptions() {
    return [
      {
        id: "novaposhta_warehouse",
        name: "Nova Poshta Warehouse",
      },
      {
        id: "novaposhta_courier",
        name: "Nova Poshta Courier",
      },
    ]
  }

  async validateOption(data: Record<string, unknown>) {
    return novaPoshtaOptionsSchema.safeParse(data).success
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: Record<string, unknown>
  ) {
    const parsed = parseOrThrow(
      fulfillmentDataSchema,
      { ...data, service_type: data.service_type ?? optionData.id },
      "Fulfillment data"
    )

    return {
      ...parsed,
      service_type: parsed.service_type ?? optionData.id,
    }
  }

  async canCalculate() {
    return true
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>
  ) {
    try {
      const fulfillmentData = parseOrThrow(
        fulfillmentDataSchema,
        { ...data, service_type: data.service_type ?? optionData.id },
        "Fulfillment data"
      )

      const items = (context.items as { quantity?: number; weight?: number }[]) ?? []
      const shippingAddress = context.shipping_address as {
        first_name?: string
        last_name?: string
        phone?: string
      }

      const payload = {
        CitySender: this.options.senderCityRef,
        CityRecipient: fulfillmentData.city_ref,
        Weight: calculateWeightKg(items),
        ServiceType: serviceTypeFromOption(
          String(fulfillmentData.service_type ?? optionData.id)
        ),
        Cost: String(context.item_total ?? context.total ?? 0),
        SeatsAmount: "1",
        RecipientAddress: fulfillmentData.warehouse_ref,
        RecipientsPhone: shippingAddress?.phone ?? this.options.phone,
      }

      const priceResult = (await this.client.getDocumentPrice(payload)) as
        | Array<{ Cost?: string | number; AssessedCost?: string | number }>
        | { Cost?: string | number }

      const cost =
        Array.isArray(priceResult) && priceResult[0]?.Cost != null
          ? Number(priceResult[0].Cost)
          : Number(
              (priceResult as { Cost?: string | number })?.Cost ?? 0
            )

      return {
        calculated_amount: Math.round(cost * 100),
        is_calculated_price_tax_inclusive: false,
      }
    } catch (error) {
      this.logError("calculatePrice failed, returning 0", error)
      return {
        calculated_amount: 0,
        is_calculated_price_tax_inclusive: false,
      }
    }
  }

  async createFulfillment(
    fulfillmentData: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    _fulfillment: Partial<
      Omit<FulfillmentDTO, "data" | "items" | "provider_id">
    >
  ) {
    if (!order) {
      throw new NovaPoshtaError(
        "Order is required to create Nova Poshta fulfillment",
        NovaPoshtaErrorCode.VALIDATION_ERROR
      )
    }
    const parsed = parseOrThrow(
      fulfillmentDataSchema,
      fulfillmentData,
      "Fulfillment data"
    )

    const shippingAddress = order.shipping_address
    if (!shippingAddress?.phone) {
      throw new NovaPoshtaError(
        "Shipping address phone is required",
        NovaPoshtaErrorCode.VALIDATION_ERROR
      )
    }

    const payload = {
      PayerType: "Recipient",
      PaymentMethod: "Cash",
      DateTime: new Date().toLocaleDateString("uk-UA"),
      CargoType: "Cargo",
      Weight: calculateWeightKg(
        items as { quantity?: number; weight?: number }[]
      ),
      ServiceType: serviceTypeFromOption(parsed.service_type),
      SeatsAmount: "1",
      Description: `Order #${order.display_id ?? ""}`,
      Cost: String(order.total ?? 0),
      CitySender: this.options.senderCityRef,
      Sender: this.options.senderRef,
      SenderAddress: this.options.senderRef,
      ContactSender: this.options.contactRef,
      SendersPhone: this.options.phone,
      CityRecipient: parsed.city_ref,
      RecipientName: `${shippingAddress.first_name ?? ""} ${shippingAddress.last_name ?? ""}`.trim(),
      RecipientsPhone: shippingAddress.phone,
      RecipientAddress: parsed.warehouse_ref,
    }

    try {
      const result = await this.client.createTTN(payload)
      const doc = result?.[0]

      if (!doc?.IntDocNumber) {
        throw new NovaPoshtaError(
          "Nova Poshta did not return TTN number",
          NovaPoshtaErrorCode.API_ERROR,
          { details: result }
        )
      }

      this.log("TTN created", { ttn: doc.IntDocNumber })

      return {
        data: {
          ttn: doc.IntDocNumber,
          ref: doc.Ref,
          raw: doc,
        } as FulfillmentProviderData,
        labels: [
          {
            tracking_number: doc.IntDocNumber,
            tracking_url: `${NP_TRACKING_URL}${doc.IntDocNumber}`,
            label_url: "",
          },
        ],
      }
    } catch (error) {
      this.logError("createFulfillment failed", error)
      throw error
    }
  }

  async cancelFulfillment(data: Record<string, unknown>) {
    const providerData = data as FulfillmentProviderData
    const ref = providerData.ref ?? providerData.raw?.Ref

    if (!ref || typeof ref !== "string") {
      this.log("cancelFulfillment: no ref to delete in Nova Poshta", { data })
      return data
    }

    try {
      await this.client.deleteTTN(ref)
      this.log("TTN canceled", { ref })
    } catch (error) {
      this.logError("cancelFulfillment failed", error)
      throw error
    }

    return data
  }

  async createReturnFulfillment(fulfillment: Record<string, unknown>) {
    return {
      data: fulfillment,
      labels: [],
    }
  }

  mapTrackingToFulfillmentUpdate(
    tracking: TrackingStatus
  ): Partial<FulfillmentProviderData> {
    return {
      tracking_status: tracking.Status,
      tracking_status_code: tracking.StatusCode,
      tracking_updated_at: new Date().toISOString(),
    }
  }

  isDelivered(statusCode?: string | number): boolean {
    return DELIVERED_STATUS_CODES.has(String(statusCode ?? ""))
  }

  async syncTrackingForFulfillment(
    fulfillmentData: FulfillmentProviderData
  ): Promise<FulfillmentProviderData | null> {
    const ttn = fulfillmentData.ttn
    if (!ttn) {
      return null
    }

    const tracking = await this.getTrackingForTtn(ttn)
    if (!tracking) {
      return null
    }

    return {
      ...fulfillmentData,
      ...this.mapTrackingToFulfillmentUpdate(tracking),
    }
  }

  validateWebhookSecret(headerSecret?: string): boolean {
    const secret = this.options.webhookSecret
    if (!secret) {
      return true
    }
    return headerSecret === secret
  }

  applyWebhookStatus(
    fulfillmentData: FulfillmentProviderData,
    status: string,
    statusCode?: string | number
  ): FulfillmentProviderData {
    return {
      ...fulfillmentData,
      tracking_status: status,
      tracking_status_code: statusCode,
      tracking_updated_at: new Date().toISOString(),
    }
  }
}

export default NovaPoshtaService
