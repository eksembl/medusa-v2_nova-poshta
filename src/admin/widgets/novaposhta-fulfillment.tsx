import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { DetailWidgetProps, AdminOrder } from "@medusajs/framework/types"
import { useMemo } from "react"

type NovaPoshtaFulfillmentData = {
  ttn?: string
  tracking_status?: string
  tracking_status_code?: string | number
  tracking_updated_at?: string
}

const NovaposhtaFulfillmentWidget = ({
  data: order,
}: DetailWidgetProps<AdminOrder>) => {
  const fulfillmentInfo = useMemo(() => {
    const fulfillments = order.fulfillments ?? []

    for (const fulfillment of fulfillments) {
      const providerId = fulfillment.provider_id ?? ""
      if (!providerId.includes("novaposhta")) {
        continue
      }

      const fData = (fulfillment.data ?? {}) as NovaPoshtaFulfillmentData
      if (fData.ttn) {
        return {
          fulfillmentId: fulfillment.id,
          ...fData,
        }
      }
    }

    return null
  }, [order])

  if (!fulfillmentInfo?.ttn) {
    return null
  }

  const trackingUrl = `https://novaposhta.ua/tracking/?cargo_number=${fulfillmentInfo.ttn}`

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Nova Poshta</Heading>
        <Badge size="small" color="blue">
          {fulfillmentInfo.tracking_status ?? "Pending"}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 px-6 py-4 text-ui-fg-subtle">
        <Text size="small">
          TTN:{" "}
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-ui-fg-interactive hover:underline"
          >
            {fulfillmentInfo.ttn}
          </a>
        </Text>
        {fulfillmentInfo.tracking_status_code != null && (
          <Text size="small">
            Status code: {String(fulfillmentInfo.tracking_status_code)}
          </Text>
        )}
        {fulfillmentInfo.tracking_updated_at && (
          <Text size="small">
            Updated:{" "}
            {new Date(fulfillmentInfo.tracking_updated_at).toLocaleString()}
          </Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default NovaposhtaFulfillmentWidget
