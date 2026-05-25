import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  modules: [
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "./src/modules/novaposhta",
            id: "novaposhta",
            options: {
              apiKey: process.env.NOVA_POSHTA_API_KEY,
              senderRef: process.env.NOVA_POSHTA_SENDER_REF,
              senderCityRef: process.env.NOVA_POSHTA_SENDER_CITY_REF,
              contactRef: process.env.NOVA_POSHTA_CONTACT_REF,
              phone: process.env.NOVA_POSHTA_PHONE,
              webhookSecret: process.env.NOVA_POSHTA_WEBHOOK_SECRET,
              cacheTtlMs: process.env.NOVA_POSHTA_CACHE_TTL_MS
                ? Number(process.env.NOVA_POSHTA_CACHE_TTL_MS)
                : undefined,
            },
          },
        ],
      },
    },
  ],
})
