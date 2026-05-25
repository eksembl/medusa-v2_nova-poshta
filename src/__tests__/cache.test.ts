import { describe, it, expect, vi, afterEach } from "vitest"
import { TtlCache } from "../modules/novaposhta/cache"

describe("TtlCache", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("stores and retrieves values", () => {
    const cache = new TtlCache<string>(60_000)
    cache.set("key", "value")
    expect(cache.get("key")).toBe("value")
  })

  it("expires entries after TTL", () => {
    vi.useFakeTimers()
    const cache = new TtlCache<string>(1000)
    cache.set("key", "value")

    vi.advanceTimersByTime(1001)
    expect(cache.get("key")).toBeUndefined()
  })

  it("clears all entries", () => {
    const cache = new TtlCache<string>(60_000)
    cache.set("a", "1")
    cache.set("b", "2")
    cache.clear()
    expect(cache.get("a")).toBeUndefined()
    expect(cache.get("b")).toBeUndefined()
  })
})
