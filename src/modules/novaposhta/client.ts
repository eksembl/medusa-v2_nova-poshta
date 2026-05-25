import axios, { type AxiosError } from "axios"
import { TtlCache } from "./cache"
import {
  NovaPoshtaError,
  NovaPoshtaErrorCode,
  isRetryableError,
  wrapApiError,
} from "./errors"
import { withRetry } from "./retry"
import type { TrackingStatus } from "./types"

const API_URL = "https://api.novaposhta.ua/v2.0/json/"
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000

export type NovaPoshtaRequestPayload = Record<string, unknown>

export class NovaPoshtaClient {
  private readonly cache = new TtlCache<unknown>(DEFAULT_CACHE_TTL_MS)

  constructor(
    private readonly apiKey: string,
    private readonly cacheTtlMs = DEFAULT_CACHE_TTL_MS
  ) {}

  async request<T = unknown>(
    modelName: string,
    calledMethod: string,
    methodProperties: NovaPoshtaRequestPayload = {},
    options?: { cacheKey?: string; skipCache?: boolean }
  ): Promise<T> {
    if (options?.cacheKey && !options.skipCache) {
      const cached = this.cache.get(options.cacheKey) as T | undefined
      if (cached !== undefined) {
        return cached
      }
    }

    const data = await withRetry(
      async () => {
        try {
          const response = await axios.post<{
            success: boolean
            data?: T
            errors?: string[]
            warnings?: string[]
          }>(
            API_URL,
            {
              apiKey: this.apiKey,
              modelName,
              calledMethod,
              methodProperties,
            },
            { timeout: 15000 }
          )

          if (!response.data.success) {
            const errors = response.data.errors ?? []
            const message =
              errors.join(", ") ||
              response.data.warnings?.join(", ") ||
              "Nova Poshta API Error"

            throw new NovaPoshtaError(message, NovaPoshtaErrorCode.API_ERROR, {
              retryable: false,
              details: { modelName, calledMethod, errors },
            })
          }

          return response.data.data as T
        } catch (error) {
          if (error instanceof NovaPoshtaError) {
            throw error
          }

          const axiosError = error as AxiosError
          if (axiosError.code === "ECONNABORTED" || !axiosError.response) {
            throw new NovaPoshtaError(
              `Network error calling Nova Poshta (${calledMethod})`,
              NovaPoshtaErrorCode.NETWORK_ERROR,
              { retryable: true, cause: axiosError }
            )
          }

          if (axiosError.response?.status === 429) {
            throw new NovaPoshtaError(
              "Nova Poshta rate limit exceeded",
              NovaPoshtaErrorCode.RATE_LIMIT,
              { retryable: true, cause: axiosError }
            )
          }

          throw wrapApiError(
            `Nova Poshta request failed (${calledMethod})`,
            { status: axiosError.response?.status },
            axiosError
          )
        }
      },
      { methodName: calledMethod }
    )

    if (options?.cacheKey) {
      this.cache.set(options.cacheKey, data, this.cacheTtlMs)
    }

    return data
  }

  async getCities(search = "") {
    const normalized = search.trim().toLowerCase()
    return this.request(
      "Address",
      "searchSettlements",
      { CityName: search, Limit: 20 },
      { cacheKey: `cities:${normalized}` }
    )
  }

  async getWarehouses(cityRef: string) {
    return this.request(
      "Address",
      "getWarehouses",
      { CityRef: cityRef },
      { cacheKey: `warehouses:${cityRef}` }
    )
  }

  async getDocumentPrice(payload: NovaPoshtaRequestPayload) {
    return this.request("InternetDocument", "getDocumentPrice", payload, {
      skipCache: true,
    })
  }

  async createTTN(payload: NovaPoshtaRequestPayload) {
    return this.request<Array<{ IntDocNumber?: string; Ref?: string }>>(
      "InternetDocument",
      "save",
      payload,
      { skipCache: true }
    )
  }

  async deleteTTN(ref: string) {
    return this.request("InternetDocument", "delete", { DocumentRefs: ref }, {
      skipCache: true,
    })
  }

  async getTrackingStatus(ttn: string): Promise<TrackingStatus[]> {
    return this.request<TrackingStatus[]>(
      "TrackingDocument",
      "getStatusDocuments",
      { Documents: [{ DocumentNumber: ttn }] },
      { skipCache: true }
    )
  }

  clearCache(): void {
    this.cache.clear()
  }
}

export { isRetryableError }
