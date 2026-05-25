# Medusa v2 Nova Poshta Fulfillment Provider

Compatible with Medusa **2.15.3**.

## Features

- Fulfillment provider (warehouse + courier)
- TTN creation, cancellation, calculated shipping price
- Retries with exponential backoff for transient API errors
- In-memory TTL cache for cities and warehouses
- Zod validation for options, checkout data, and webhooks
- Admin API: city search, warehouses, health check
- Store webhook: `POST /store/novaposhta/webhook`
- Scheduled tracking sync job (every 30 minutes)
- Admin widget on order details (TTN + tracking status)
- Unit tests (Vitest)

## Installation

```bash
npm install
npm run build
```

In your Medusa app's `medusa-config.ts`:

```ts
{
  resolve: "@medusajs/medusa/fulfillment",
  options: {
    providers: [
      {
        resolve: "medusa-fulfillment-novaposhta-v2",
        id: "novaposhta",
        options: {
          apiKey: process.env.NOVA_POSHTA_API_KEY,
          senderRef: process.env.NOVA_POSHTA_SENDER_REF,
          senderCityRef: process.env.NOVA_POSHTA_SENDER_CITY_REF,
          contactRef: process.env.NOVA_POSHTA_CONTACT_REF,
          phone: process.env.NOVA_POSHTA_PHONE,
          webhookSecret: process.env.NOVA_POSHTA_WEBHOOK_SECRET,
        },
      },
    ],
  },
}
```

## Admin API

| Endpoint | Description |
|----------|-------------|
| `GET /admin/novaposhta?city=Kyiv` | Search cities |
| `GET /admin/novaposhta?city_ref=...` | List warehouses |
| `GET /admin/novaposhta?action=health` | Test API connection |

## Webhook

`POST /store/novaposhta/webhook`

Header (if `webhookSecret` is set): `x-novaposhta-webhook-secret`

```json
{
  "ttn": "20450123456789",
  "status": "Delivered",
  "status_code": "9",
  "fulfillment_id": "ful_..."
}
```

## Tests

```bash
npm test
```

## Checkout metadata

Pass on the shipping method:

```json
{
  "city_ref": "uuid-city",
  "warehouse_ref": "uuid-warehouse"
}
```
