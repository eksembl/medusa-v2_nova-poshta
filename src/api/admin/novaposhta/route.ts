import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import NovaPoshtaService from "../../../modules/novaposhta/service"
import {
  citySearchQuerySchema,
  warehouseQuerySchema,
  parseOrThrow,
} from "../../../modules/novaposhta/schemas"
import { NovaPoshtaError, NovaPoshtaErrorCode } from "../../../modules/novaposhta/errors"

function resolveService(req: MedusaRequest): NovaPoshtaService {
  return req.scope.resolve("novaposhta") as NovaPoshtaService
}

function handleError(res: MedusaResponse, error: unknown) {
  if (error instanceof NovaPoshtaError) {
    const status =
      error.code === NovaPoshtaErrorCode.VALIDATION_ERROR ? 400 : 502
    return res.status(status).json({
      type: error.code,
      message: error.message,
      details: error.details,
    })
  }

  if (error instanceof Error && error.message.includes(":")) {
    return res.status(400).json({ message: error.message })
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  return res.status(500).json({ message })
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service = resolveService(req)
    const action = req.query.action as string | undefined

    if (action === "health") {
      const result = await service.testConnection()
      return res.json(result)
    }

    if (req.query.city_ref) {
      const { city_ref } = parseOrThrow(
        warehouseQuerySchema,
        req.query,
        "Query"
      )
      const result = await service.listWarehouses(city_ref)
      return res.json(result)
    }

    const { city } = parseOrThrow(citySearchQuerySchema, req.query, "Query")
    const result = await service.searchCities(city)
    return res.json(result)
  } catch (error) {
    return handleError(res, error)
  }
}
