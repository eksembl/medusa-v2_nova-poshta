import { z } from "zod"

export const novaPoshtaOptionsSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
  senderRef: z.string().min(1, "senderRef is required"),
  senderCityRef: z.string().min(1, "senderCityRef is required"),
  contactRef: z.string().min(1, "contactRef is required"),
  phone: z.string().min(10, "phone must be at least 10 characters"),
  webhookSecret: z.string().optional(),
  cacheTtlMs: z.number().positive().optional(),
})

export const fulfillmentDataSchema = z.object({
  city_ref: z.string().min(1, "city_ref is required"),
  warehouse_ref: z.string().min(1, "warehouse_ref is required"),
  service_type: z
    .enum(["novaposhta_warehouse", "novaposhta_courier"])
    .optional()
    .default("novaposhta_warehouse"),
})

export const citySearchQuerySchema = z.object({
  city: z.string().optional().default(""),
})

export const warehouseQuerySchema = z.object({
  city_ref: z.string().min(1, "city_ref is required"),
})

export const webhookPayloadSchema = z.object({
  ttn: z.string().min(1),
  status: z.string().min(1),
  status_code: z.union([z.string(), z.number()]).optional(),
  fulfillment_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const trackingStatusSchema = z.object({
  Number: z.string().optional(),
  Status: z.string().optional(),
  StatusCode: z.union([z.string(), z.number()]).optional(),
  WarehouseRecipient: z.string().optional(),
  ScheduledDeliveryDate: z.string().optional(),
})

export type NovaPoshtaOptionsInput = z.infer<typeof novaPoshtaOptionsSchema>
export type FulfillmentDataInput = z.infer<typeof fulfillmentDataSchema>
export type WebhookPayloadInput = z.infer<typeof webhookPayloadSchema>

export function parseOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  label: string
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ")
    throw new Error(`${label}: ${message}`)
  }
  return result.data
}
