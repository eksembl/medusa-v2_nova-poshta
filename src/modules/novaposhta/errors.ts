export enum NovaPoshtaErrorCode {
  API_ERROR = "NOVA_POSHTA_API_ERROR",
  VALIDATION_ERROR = "NOVA_POSHTA_VALIDATION_ERROR",
  CONFIG_ERROR = "NOVA_POSHTA_CONFIG_ERROR",
  NOT_FOUND = "NOVA_POSHTA_NOT_FOUND",
  NETWORK_ERROR = "NOVA_POSHTA_NETWORK_ERROR",
  RATE_LIMIT = "NOVA_POSHTA_RATE_LIMIT",
}

export class NovaPoshtaError extends Error {
  readonly code: NovaPoshtaErrorCode
  readonly retryable: boolean
  readonly details?: unknown

  constructor(
    message: string,
    code: NovaPoshtaErrorCode,
    options?: { retryable?: boolean; details?: unknown; cause?: Error }
  ) {
    super(message, { cause: options?.cause })
    this.name = "NovaPoshtaError"
    this.code = code
    this.retryable = options?.retryable ?? false
    this.details = options?.details
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof NovaPoshtaError) {
    return error.retryable
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code
    if (
      code === "ECONNABORTED" ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "ENOTFOUND"
    ) {
      return true
    }
  }

  if (error && typeof error === "object" && "response" in error) {
    const status = (error as { response?: { status?: number } }).response
      ?.status
    if (status && (status >= 500 || status === 429)) {
      return true
    }
  }

  return false
}

export function wrapApiError(
  message: string,
  details?: unknown,
  cause?: Error
): NovaPoshtaError {
  return new NovaPoshtaError(message, NovaPoshtaErrorCode.API_ERROR, {
    retryable: cause ? isRetryableError(cause) : false,
    details,
    cause,
  })
}
