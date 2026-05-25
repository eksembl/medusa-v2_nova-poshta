import { AbstractFulfillmentProviderService } from '@medusajs/framework/utils';
import { Logger, FulfillmentItemDTO, FulfillmentOrderDTO, FulfillmentDTO } from '@medusajs/framework/types';
import { z } from 'zod';

declare enum NovaPoshtaErrorCode {
    API_ERROR = "NOVA_POSHTA_API_ERROR",
    VALIDATION_ERROR = "NOVA_POSHTA_VALIDATION_ERROR",
    CONFIG_ERROR = "NOVA_POSHTA_CONFIG_ERROR",
    NOT_FOUND = "NOVA_POSHTA_NOT_FOUND",
    NETWORK_ERROR = "NOVA_POSHTA_NETWORK_ERROR",
    RATE_LIMIT = "NOVA_POSHTA_RATE_LIMIT"
}
declare class NovaPoshtaError extends Error {
    readonly code: NovaPoshtaErrorCode;
    readonly retryable: boolean;
    readonly details?: unknown;
    constructor(message: string, code: NovaPoshtaErrorCode, options?: {
        retryable?: boolean;
        details?: unknown;
        cause?: Error;
    });
}
declare function isRetryableError(error: unknown): boolean;
declare function wrapApiError(message: string, details?: unknown, cause?: Error): NovaPoshtaError;

type NovaPoshtaOptions = {
    apiKey: string;
    senderRef: string;
    senderCityRef: string;
    contactRef: string;
    phone: string;
    webhookSecret?: string;
    cacheTtlMs?: number;
};
type TrackingStatus = {
    Number?: string;
    Status?: string;
    StatusCode?: string | number;
    WarehouseRecipient?: string;
    ScheduledDeliveryDate?: string;
};
type FulfillmentProviderData = {
    ttn?: string;
    ref?: string;
    tracking_status?: string;
    tracking_status_code?: string | number;
    tracking_updated_at?: string;
    raw?: Record<string, unknown>;
};
declare const DELIVERED_STATUS_CODES: Set<string>;
declare const CANCELED_STATUS_CODES: Set<string>;

type NovaPoshtaRequestPayload = Record<string, unknown>;
declare class NovaPoshtaClient {
    private readonly apiKey;
    private readonly cacheTtlMs;
    private readonly cache;
    constructor(apiKey: string, cacheTtlMs?: number);
    request<T = unknown>(modelName: string, calledMethod: string, methodProperties?: NovaPoshtaRequestPayload, options?: {
        cacheKey?: string;
        skipCache?: boolean;
    }): Promise<T>;
    getCities(search?: string): Promise<unknown>;
    getWarehouses(cityRef: string): Promise<unknown>;
    getDocumentPrice(payload: NovaPoshtaRequestPayload): Promise<unknown>;
    createTTN(payload: NovaPoshtaRequestPayload): Promise<{
        IntDocNumber?: string;
        Ref?: string;
    }[]>;
    deleteTTN(ref: string): Promise<unknown>;
    getTrackingStatus(ttn: string): Promise<TrackingStatus[]>;
    clearCache(): void;
}

type InjectedDependencies = {
    logger?: Logger;
};
declare class NovaPoshtaService extends AbstractFulfillmentProviderService {
    static identifier: string;
    protected client: NovaPoshtaClient;
    protected options: NovaPoshtaOptions;
    protected logger_?: Logger;
    constructor({ logger }: InjectedDependencies | undefined, options: NovaPoshtaOptions);
    private log;
    private logError;
    searchCities(query?: string): Promise<unknown>;
    listWarehouses(cityRef: string): Promise<unknown>;
    getTrackingForTtn(ttn: string): Promise<TrackingStatus | null>;
    testConnection(): Promise<{
        ok: boolean;
    }>;
    getFulfillmentOptions(): Promise<{
        id: string;
        name: string;
    }[]>;
    validateOption(data: Record<string, unknown>): Promise<boolean>;
    validateFulfillmentData(optionData: Record<string, unknown>, data: Record<string, unknown>, _context: Record<string, unknown>): Promise<{
        service_type: unknown;
        city_ref: string;
        warehouse_ref: string;
    }>;
    canCalculate(): Promise<boolean>;
    calculatePrice(optionData: Record<string, unknown>, data: Record<string, unknown>, context: Record<string, unknown>): Promise<{
        calculated_amount: number;
        is_calculated_price_tax_inclusive: boolean;
    }>;
    createFulfillment(fulfillmentData: Record<string, unknown>, items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[], order: Partial<FulfillmentOrderDTO> | undefined, _fulfillment: Partial<Omit<FulfillmentDTO, "data" | "items" | "provider_id">>): Promise<{
        data: FulfillmentProviderData;
        labels: {
            tracking_number: string;
            tracking_url: string;
            label_url: string;
        }[];
    }>;
    cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    createReturnFulfillment(fulfillment: Record<string, unknown>): Promise<{
        data: Record<string, unknown>;
        labels: never[];
    }>;
    mapTrackingToFulfillmentUpdate(tracking: TrackingStatus): Partial<FulfillmentProviderData>;
    isDelivered(statusCode?: string | number): boolean;
    syncTrackingForFulfillment(fulfillmentData: FulfillmentProviderData): Promise<FulfillmentProviderData | null>;
    validateWebhookSecret(headerSecret?: string): boolean;
    applyWebhookStatus(fulfillmentData: FulfillmentProviderData, status: string, statusCode?: string | number): FulfillmentProviderData;
}

declare const novaPoshtaOptionsSchema: z.ZodObject<{
    apiKey: z.ZodString;
    senderRef: z.ZodString;
    senderCityRef: z.ZodString;
    contactRef: z.ZodString;
    phone: z.ZodString;
    webhookSecret: z.ZodOptional<z.ZodString>;
    cacheTtlMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    apiKey: string;
    senderRef: string;
    senderCityRef: string;
    contactRef: string;
    phone: string;
    webhookSecret?: string | undefined;
    cacheTtlMs?: number | undefined;
}, {
    apiKey: string;
    senderRef: string;
    senderCityRef: string;
    contactRef: string;
    phone: string;
    webhookSecret?: string | undefined;
    cacheTtlMs?: number | undefined;
}>;
declare const fulfillmentDataSchema: z.ZodObject<{
    city_ref: z.ZodString;
    warehouse_ref: z.ZodString;
    service_type: z.ZodDefault<z.ZodOptional<z.ZodEnum<["novaposhta_warehouse", "novaposhta_courier"]>>>;
}, "strip", z.ZodTypeAny, {
    city_ref: string;
    warehouse_ref: string;
    service_type: "novaposhta_warehouse" | "novaposhta_courier";
}, {
    city_ref: string;
    warehouse_ref: string;
    service_type?: "novaposhta_warehouse" | "novaposhta_courier" | undefined;
}>;
declare const citySearchQuerySchema: z.ZodObject<{
    city: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    city: string;
}, {
    city?: string | undefined;
}>;
declare const warehouseQuerySchema: z.ZodObject<{
    city_ref: z.ZodString;
}, "strip", z.ZodTypeAny, {
    city_ref: string;
}, {
    city_ref: string;
}>;
declare const webhookPayloadSchema: z.ZodObject<{
    ttn: z.ZodString;
    status: z.ZodString;
    status_code: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    fulfillment_id: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status: string;
    ttn: string;
    status_code?: string | number | undefined;
    fulfillment_id?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    status: string;
    ttn: string;
    status_code?: string | number | undefined;
    fulfillment_id?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
declare const trackingStatusSchema: z.ZodObject<{
    Number: z.ZodOptional<z.ZodString>;
    Status: z.ZodOptional<z.ZodString>;
    StatusCode: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    WarehouseRecipient: z.ZodOptional<z.ZodString>;
    ScheduledDeliveryDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    Number?: string | undefined;
    Status?: string | undefined;
    StatusCode?: string | number | undefined;
    WarehouseRecipient?: string | undefined;
    ScheduledDeliveryDate?: string | undefined;
}, {
    Number?: string | undefined;
    Status?: string | undefined;
    StatusCode?: string | number | undefined;
    WarehouseRecipient?: string | undefined;
    ScheduledDeliveryDate?: string | undefined;
}>;
type NovaPoshtaOptionsInput = z.infer<typeof novaPoshtaOptionsSchema>;
type FulfillmentDataInput = z.infer<typeof fulfillmentDataSchema>;
type WebhookPayloadInput = z.infer<typeof webhookPayloadSchema>;
declare function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T;

declare const NOVAPOSHTA_MODULE = "novaposhta";
declare const NP_TRACKING_URL = "https://novaposhta.ua/tracking/?cargo_number=";

export { CANCELED_STATUS_CODES, DELIVERED_STATUS_CODES, type FulfillmentDataInput, type FulfillmentProviderData, NOVAPOSHTA_MODULE, NP_TRACKING_URL, NovaPoshtaClient, NovaPoshtaError, NovaPoshtaErrorCode, type NovaPoshtaOptions, type NovaPoshtaOptionsInput, NovaPoshtaService, type TrackingStatus, type WebhookPayloadInput, citySearchQuerySchema, fulfillmentDataSchema, isRetryableError, novaPoshtaOptionsSchema, parseOrThrow, trackingStatusSchema, warehouseQuerySchema, webhookPayloadSchema, wrapApiError };
