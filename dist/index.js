// src/modules/novaposhta/service.ts
import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";

// src/modules/novaposhta/client.ts
import axios from "axios";

// src/modules/novaposhta/cache.ts
var TtlCache = class {
  constructor(defaultTtlMs) {
    this.defaultTtlMs = defaultTtlMs;
  }
  defaultTtlMs;
  store = /* @__PURE__ */ new Map();
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return void 0;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return void 0;
    }
    return entry.value;
  }
  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs)
    });
  }
  delete(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
};

// src/modules/novaposhta/errors.ts
var NovaPoshtaErrorCode = /* @__PURE__ */ ((NovaPoshtaErrorCode2) => {
  NovaPoshtaErrorCode2["API_ERROR"] = "NOVA_POSHTA_API_ERROR";
  NovaPoshtaErrorCode2["VALIDATION_ERROR"] = "NOVA_POSHTA_VALIDATION_ERROR";
  NovaPoshtaErrorCode2["CONFIG_ERROR"] = "NOVA_POSHTA_CONFIG_ERROR";
  NovaPoshtaErrorCode2["NOT_FOUND"] = "NOVA_POSHTA_NOT_FOUND";
  NovaPoshtaErrorCode2["NETWORK_ERROR"] = "NOVA_POSHTA_NETWORK_ERROR";
  NovaPoshtaErrorCode2["RATE_LIMIT"] = "NOVA_POSHTA_RATE_LIMIT";
  return NovaPoshtaErrorCode2;
})(NovaPoshtaErrorCode || {});
var NovaPoshtaError = class extends Error {
  code;
  retryable;
  details;
  constructor(message, code, options) {
    super(message, { cause: options?.cause });
    this.name = "NovaPoshtaError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
};
function isRetryableError(error) {
  if (error instanceof NovaPoshtaError) {
    return error.retryable;
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (code === "ECONNABORTED" || code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND") {
      return true;
    }
  }
  if (error && typeof error === "object" && "response" in error) {
    const status = error.response?.status;
    if (status && (status >= 500 || status === 429)) {
      return true;
    }
  }
  return false;
}
function wrapApiError(message, details, cause) {
  return new NovaPoshtaError(message, "NOVA_POSHTA_API_ERROR" /* API_ERROR */, {
    retryable: cause ? isRetryableError(cause) : false,
    details,
    cause
  });
}

// src/modules/novaposhta/retry.ts
var DEFAULT_OPTIONS = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8e3,
  nonRetryableMethods: /* @__PURE__ */ new Set(["save", "delete"])
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function backoffDelay(attempt, baseDelayMs, maxDelayMs) {
  const delay = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.2 * delay;
  return Math.min(delay + jitter, maxDelayMs);
}
async function withRetry(fn, options) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const methodName = options?.methodName;
  if (methodName && opts.nonRetryableMethods.has(methodName)) {
    return fn();
  }
  let lastError;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt >= opts.maxAttempts) {
        throw error;
      }
      await sleep(backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs));
    }
  }
  throw lastError;
}

// src/modules/novaposhta/client.ts
var API_URL = "https://api.novaposhta.ua/v2.0/json/";
var DEFAULT_CACHE_TTL_MS = 15 * 60 * 1e3;
var NovaPoshtaClient = class {
  constructor(apiKey, cacheTtlMs = DEFAULT_CACHE_TTL_MS) {
    this.apiKey = apiKey;
    this.cacheTtlMs = cacheTtlMs;
  }
  apiKey;
  cacheTtlMs;
  cache = new TtlCache(DEFAULT_CACHE_TTL_MS);
  async request(modelName, calledMethod, methodProperties = {}, options) {
    if (options?.cacheKey && !options.skipCache) {
      const cached = this.cache.get(options.cacheKey);
      if (cached !== void 0) {
        return cached;
      }
    }
    const data = await withRetry(
      async () => {
        try {
          const response = await axios.post(
            API_URL,
            {
              apiKey: this.apiKey,
              modelName,
              calledMethod,
              methodProperties
            },
            { timeout: 15e3 }
          );
          if (!response.data.success) {
            const errors = response.data.errors ?? [];
            const message = errors.join(", ") || response.data.warnings?.join(", ") || "Nova Poshta API Error";
            throw new NovaPoshtaError(message, "NOVA_POSHTA_API_ERROR" /* API_ERROR */, {
              retryable: false,
              details: { modelName, calledMethod, errors }
            });
          }
          return response.data.data;
        } catch (error) {
          if (error instanceof NovaPoshtaError) {
            throw error;
          }
          const axiosError = error;
          if (axiosError.code === "ECONNABORTED" || !axiosError.response) {
            throw new NovaPoshtaError(
              `Network error calling Nova Poshta (${calledMethod})`,
              "NOVA_POSHTA_NETWORK_ERROR" /* NETWORK_ERROR */,
              { retryable: true, cause: axiosError }
            );
          }
          if (axiosError.response?.status === 429) {
            throw new NovaPoshtaError(
              "Nova Poshta rate limit exceeded",
              "NOVA_POSHTA_RATE_LIMIT" /* RATE_LIMIT */,
              { retryable: true, cause: axiosError }
            );
          }
          throw wrapApiError(
            `Nova Poshta request failed (${calledMethod})`,
            { status: axiosError.response?.status },
            axiosError
          );
        }
      },
      { methodName: calledMethod }
    );
    if (options?.cacheKey) {
      this.cache.set(options.cacheKey, data, this.cacheTtlMs);
    }
    return data;
  }
  async getCities(search = "") {
    const normalized = search.trim().toLowerCase();
    return this.request(
      "Address",
      "searchSettlements",
      { CityName: search, Limit: 20 },
      { cacheKey: `cities:${normalized}` }
    );
  }
  async getWarehouses(cityRef) {
    return this.request(
      "Address",
      "getWarehouses",
      { CityRef: cityRef },
      { cacheKey: `warehouses:${cityRef}` }
    );
  }
  async getDocumentPrice(payload) {
    return this.request("InternetDocument", "getDocumentPrice", payload, {
      skipCache: true
    });
  }
  async createTTN(payload) {
    return this.request(
      "InternetDocument",
      "save",
      payload,
      { skipCache: true }
    );
  }
  async deleteTTN(ref) {
    return this.request("InternetDocument", "delete", { DocumentRefs: ref }, {
      skipCache: true
    });
  }
  async getTrackingStatus(ttn) {
    return this.request(
      "TrackingDocument",
      "getStatusDocuments",
      { Documents: [{ DocumentNumber: ttn }] },
      { skipCache: true }
    );
  }
  clearCache() {
    this.cache.clear();
  }
};

// src/modules/novaposhta/constants.ts
var NOVAPOSHTA_MODULE = "novaposhta";
var NP_TRACKING_URL = "https://novaposhta.ua/tracking/?cargo_number=";

// src/modules/novaposhta/schemas.ts
import { z } from "zod";
var novaPoshtaOptionsSchema = z.object({
  apiKey: z.string().min(1, "apiKey is required"),
  senderRef: z.string().min(1, "senderRef is required"),
  senderCityRef: z.string().min(1, "senderCityRef is required"),
  contactRef: z.string().min(1, "contactRef is required"),
  phone: z.string().min(10, "phone must be at least 10 characters"),
  webhookSecret: z.string().optional(),
  cacheTtlMs: z.number().positive().optional()
});
var fulfillmentDataSchema = z.object({
  city_ref: z.string().min(1, "city_ref is required"),
  warehouse_ref: z.string().min(1, "warehouse_ref is required"),
  service_type: z.enum(["novaposhta_warehouse", "novaposhta_courier"]).optional().default("novaposhta_warehouse")
});
var citySearchQuerySchema = z.object({
  city: z.string().optional().default("")
});
var warehouseQuerySchema = z.object({
  city_ref: z.string().min(1, "city_ref is required")
});
var webhookPayloadSchema = z.object({
  ttn: z.string().min(1),
  status: z.string().min(1),
  status_code: z.union([z.string(), z.number()]).optional(),
  fulfillment_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});
var trackingStatusSchema = z.object({
  Number: z.string().optional(),
  Status: z.string().optional(),
  StatusCode: z.union([z.string(), z.number()]).optional(),
  WarehouseRecipient: z.string().optional(),
  ScheduledDeliveryDate: z.string().optional()
});
function parseOrThrow(schema, data, label) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`${label}: ${message}`);
  }
  return result.data;
}

// src/modules/novaposhta/types.ts
var DELIVERED_STATUS_CODES = /* @__PURE__ */ new Set(["9", "10", "11"]);
var CANCELED_STATUS_CODES = /* @__PURE__ */ new Set(["102", "103"]);

// src/modules/novaposhta/service.ts
function calculateWeightKg(items) {
  const totalGrams = items.reduce((sum, item) => {
    const qty = Number(item.quantity ?? 1);
    const weight = Number(item.weight ?? 500);
    return sum + qty * weight;
  }, 0);
  const kg = Math.max(0.1, totalGrams / 1e3);
  return kg.toFixed(2);
}
function serviceTypeFromOption(serviceType) {
  return serviceType === "novaposhta_courier" ? "WarehouseDoors" : "WarehouseWarehouse";
}
var NovaPoshtaService = class extends AbstractFulfillmentProviderService {
  static identifier = "novaposhta";
  client;
  options;
  logger_;
  constructor({ logger } = {}, options) {
    super();
    this.logger_ = logger;
    this.options = parseOrThrow(
      novaPoshtaOptionsSchema,
      options,
      "Nova Poshta options"
    );
    this.client = new NovaPoshtaClient(
      this.options.apiKey,
      this.options.cacheTtlMs
    );
  }
  log(message, meta) {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    this.logger_?.info(`[novaposhta] ${message}${suffix}`);
  }
  logError(message, error) {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger_?.error(`[novaposhta] ${message}`, err);
  }
  async searchCities(query = "") {
    return this.client.getCities(query);
  }
  async listWarehouses(cityRef) {
    return this.client.getWarehouses(cityRef);
  }
  async getTrackingForTtn(ttn) {
    const statuses = await this.client.getTrackingStatus(ttn);
    return statuses?.[0] ?? null;
  }
  async testConnection() {
    await this.client.getCities("\u041A\u0438\u0457\u0432");
    return { ok: true };
  }
  async getFulfillmentOptions() {
    return [
      {
        id: "novaposhta_warehouse",
        name: "Nova Poshta Warehouse"
      },
      {
        id: "novaposhta_courier",
        name: "Nova Poshta Courier"
      }
    ];
  }
  async validateOption(data) {
    return novaPoshtaOptionsSchema.safeParse(data).success;
  }
  async validateFulfillmentData(optionData, data, _context) {
    const parsed = parseOrThrow(
      fulfillmentDataSchema,
      { ...data, service_type: data.service_type ?? optionData.id },
      "Fulfillment data"
    );
    return {
      ...parsed,
      service_type: parsed.service_type ?? optionData.id
    };
  }
  async canCalculate() {
    return true;
  }
  async calculatePrice(optionData, data, context) {
    try {
      const fulfillmentData = parseOrThrow(
        fulfillmentDataSchema,
        { ...data, service_type: data.service_type ?? optionData.id },
        "Fulfillment data"
      );
      const items = context.items ?? [];
      const shippingAddress = context.shipping_address;
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
        RecipientsPhone: shippingAddress?.phone ?? this.options.phone
      };
      const priceResult = await this.client.getDocumentPrice(payload);
      const cost = Array.isArray(priceResult) && priceResult[0]?.Cost != null ? Number(priceResult[0].Cost) : Number(
        priceResult?.Cost ?? 0
      );
      return {
        calculated_amount: Math.round(cost * 100),
        is_calculated_price_tax_inclusive: false
      };
    } catch (error) {
      this.logError("calculatePrice failed, returning 0", error);
      return {
        calculated_amount: 0,
        is_calculated_price_tax_inclusive: false
      };
    }
  }
  async createFulfillment(fulfillmentData, items, order, _fulfillment) {
    if (!order) {
      throw new NovaPoshtaError(
        "Order is required to create Nova Poshta fulfillment",
        "NOVA_POSHTA_VALIDATION_ERROR" /* VALIDATION_ERROR */
      );
    }
    const parsed = parseOrThrow(
      fulfillmentDataSchema,
      fulfillmentData,
      "Fulfillment data"
    );
    const shippingAddress = order.shipping_address;
    if (!shippingAddress?.phone) {
      throw new NovaPoshtaError(
        "Shipping address phone is required",
        "NOVA_POSHTA_VALIDATION_ERROR" /* VALIDATION_ERROR */
      );
    }
    const payload = {
      PayerType: "Recipient",
      PaymentMethod: "Cash",
      DateTime: (/* @__PURE__ */ new Date()).toLocaleDateString("uk-UA"),
      CargoType: "Cargo",
      Weight: calculateWeightKg(
        items
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
      RecipientAddress: parsed.warehouse_ref
    };
    try {
      const result = await this.client.createTTN(payload);
      const doc = result?.[0];
      if (!doc?.IntDocNumber) {
        throw new NovaPoshtaError(
          "Nova Poshta did not return TTN number",
          "NOVA_POSHTA_API_ERROR" /* API_ERROR */,
          { details: result }
        );
      }
      this.log("TTN created", { ttn: doc.IntDocNumber });
      return {
        data: {
          ttn: doc.IntDocNumber,
          ref: doc.Ref,
          raw: doc
        },
        labels: [
          {
            tracking_number: doc.IntDocNumber,
            tracking_url: `${NP_TRACKING_URL}${doc.IntDocNumber}`,
            label_url: ""
          }
        ]
      };
    } catch (error) {
      this.logError("createFulfillment failed", error);
      throw error;
    }
  }
  async cancelFulfillment(data) {
    const providerData = data;
    const ref = providerData.ref ?? providerData.raw?.Ref;
    if (!ref || typeof ref !== "string") {
      this.log("cancelFulfillment: no ref to delete in Nova Poshta", { data });
      return data;
    }
    try {
      await this.client.deleteTTN(ref);
      this.log("TTN canceled", { ref });
    } catch (error) {
      this.logError("cancelFulfillment failed", error);
      throw error;
    }
    return data;
  }
  async createReturnFulfillment(fulfillment) {
    return {
      data: fulfillment,
      labels: []
    };
  }
  mapTrackingToFulfillmentUpdate(tracking) {
    return {
      tracking_status: tracking.Status,
      tracking_status_code: tracking.StatusCode,
      tracking_updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  isDelivered(statusCode) {
    return DELIVERED_STATUS_CODES.has(String(statusCode ?? ""));
  }
  async syncTrackingForFulfillment(fulfillmentData) {
    const ttn = fulfillmentData.ttn;
    if (!ttn) {
      return null;
    }
    const tracking = await this.getTrackingForTtn(ttn);
    if (!tracking) {
      return null;
    }
    return {
      ...fulfillmentData,
      ...this.mapTrackingToFulfillmentUpdate(tracking)
    };
  }
  validateWebhookSecret(headerSecret) {
    const secret = this.options.webhookSecret;
    if (!secret) {
      return true;
    }
    return headerSecret === secret;
  }
  applyWebhookStatus(fulfillmentData, status, statusCode) {
    return {
      ...fulfillmentData,
      tracking_status: status,
      tracking_status_code: statusCode,
      tracking_updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var service_default = NovaPoshtaService;
export {
  CANCELED_STATUS_CODES,
  DELIVERED_STATUS_CODES,
  NOVAPOSHTA_MODULE,
  NP_TRACKING_URL,
  NovaPoshtaClient,
  NovaPoshtaError,
  NovaPoshtaErrorCode,
  service_default as NovaPoshtaService,
  citySearchQuerySchema,
  fulfillmentDataSchema,
  isRetryableError,
  novaPoshtaOptionsSchema,
  parseOrThrow,
  trackingStatusSchema,
  warehouseQuerySchema,
  webhookPayloadSchema,
  wrapApiError
};
