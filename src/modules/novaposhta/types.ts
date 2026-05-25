export type NovaPoshtaOptions = {
  apiKey: string
  senderRef: string
  senderCityRef: string
  contactRef: string
  phone: string
  webhookSecret?: string
  cacheTtlMs?: number
}

export type TrackingStatus = {
  Number?: string
  Status?: string
  StatusCode?: string | number
  WarehouseRecipient?: string
  ScheduledDeliveryDate?: string
}

export type FulfillmentProviderData = {
  ttn?: string
  ref?: string
  tracking_status?: string
  tracking_status_code?: string | number
  tracking_updated_at?: string
  raw?: Record<string, unknown>
}

export const DELIVERED_STATUS_CODES = new Set(["9", "10", "11"])
export const CANCELED_STATUS_CODES = new Set(["102", "103"])
