import { isRetryableError } from "./errors"

export type RetryOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Methods that must not be retried (e.g. save/create TTN) */
  nonRetryableMethods?: Set<string>
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "nonRetryableMethods">> & {
  nonRetryableMethods: Set<string>
} = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  nonRetryableMethods: new Set(["save", "delete"]),
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt - 1)
  const jitter = Math.random() * 0.2 * delay
  return Math.min(delay + jitter, maxDelayMs)
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions & { methodName?: string }
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const methodName = options?.methodName

  if (methodName && opts.nonRetryableMethods.has(methodName)) {
    return fn()
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (!isRetryableError(error) || attempt >= opts.maxAttempts) {
        throw error
      }

      await sleep(backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs))
    }
  }

  throw lastError
}
