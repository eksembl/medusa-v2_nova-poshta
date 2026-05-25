import { describe, it, expect, vi } from "vitest"
import { withRetry } from "../modules/novaposhta/retry"
import { NovaPoshtaError, NovaPoshtaErrorCode } from "../modules/novaposhta/errors"

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    await expect(withRetry(fn)).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on retryable errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new NovaPoshtaError("network", NovaPoshtaErrorCode.NETWORK_ERROR, {
          retryable: true,
        })
      )
      .mockResolvedValue("ok")

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).resolves.toBe(
      "ok"
    )
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-retryable methods", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(
        new NovaPoshtaError("fail", NovaPoshtaErrorCode.NETWORK_ERROR, {
          retryable: true,
        })
      )

    await expect(
      withRetry(fn, { methodName: "save", maxAttempts: 3 })
    ).rejects.toThrow("fail")
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
