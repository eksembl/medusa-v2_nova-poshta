import { describe, it, expect, vi, beforeEach } from "vitest"
import axios from "axios"
import { NovaPoshtaClient } from "../modules/novaposhta/client"
import { NovaPoshtaError } from "../modules/novaposhta/errors"

vi.mock("axios")

describe("NovaPoshtaClient", () => {
  const mockedAxios = vi.mocked(axios)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns data on successful API response", async () => {
    mockedAxios.post.mockResolvedValue({
      data: { success: true, data: [{ Present: "Kyiv" }] },
    })

    const client = new NovaPoshtaClient("test-key")
    const result = await client.getCities("Kyiv")

    expect(result).toEqual([{ Present: "Kyiv" }])
    expect(mockedAxios.post).toHaveBeenCalled()
  })

  it("throws NovaPoshtaError on API errors", async () => {
    mockedAxios.post.mockResolvedValue({
      data: { success: false, errors: ["Invalid API key"] },
    })

    const client = new NovaPoshtaClient("bad-key")
    await expect(client.getCities()).rejects.toBeInstanceOf(NovaPoshtaError)
  })

  it("caches repeated city searches", async () => {
    mockedAxios.post.mockResolvedValue({
      data: { success: true, data: [{ Present: "Kyiv" }] },
    })

    const client = new NovaPoshtaClient("test-key")
    await client.getCities("kyiv")
    await client.getCities("kyiv")

    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
  })
})
