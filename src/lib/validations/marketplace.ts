import { z } from "zod";

export const marketplaceWebhookSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    productId: z.string().min(1),
    customerData: z.object({
      email: z.string().email(),
      name: z.string().optional().default(""),
      phone: z.string().optional().default(""),
      customFields: z.array(z.unknown()).optional().default([]),
    }),
    amount: z.number(),
    discount: z.number().default(0),
    feeAmount: z.number().default(0),
    netTotal: z.number().default(0),
    systemCommissionAmount: z.union([z.number(), z.string()]).default(0),
    commissionAmount: z.number().default(0),
    taxFeeAmount: z.number().default(0),
    couponCode: z.string().optional().default(""),
    currency: z.string().default("TWD"),
    paymentMethod: z.string().optional().default(""),
    createdAt: z.string(),
  }),
  event: z.enum(["paid", "refund"]),
  timestamp: z.string(),
});

export type MarketplaceWebhookPayload = z.infer<typeof marketplaceWebhookSchema>;
