import { z } from "zod";

export const callbackHeadersSchema = z.object({
  timestamp: z.string().min(1),
  signature: z.string().min(1),
  event: z.string().min(1),
});

export const callbackPayloadSchema = z.object({
  sessionId: z.string().optional(),
  merchantOrderNumber: z.string().optional(),
  subscriptionId: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  planId: z.string().optional(),
  paymentMethod: z.string().optional(),
  mode: z.string().optional(),
  // Portaly forwards the payer's email for audit/ref-code context. Do not
  // treat it as the local identity boundary; the local order/session link is
  // the authority for entitlement ownership.
  customerEmail: z.string().email().optional(),
});
// F-22: no .passthrough(). Zod's default `strip` mode silently drops
// unknown keys from parsed.data, so any extra Portaly field can no longer
// leak into downstream logic untyped. The raw payload is still stored
// verbatim in orders.callbackPayload for full audit, so we don't lose
// any info — we only stop trusting unknown keys at the type layer.

export type CallbackHeaders = z.infer<typeof callbackHeadersSchema>;
export type CallbackPayload = z.infer<typeof callbackPayloadSchema>;

// Payment refund outcomes are a different contract from Marketplace refunds.
export const paymentRefundPayloadSchema = z.object({
  event: z.literal("creator_subscription.payment.refunded"),
  mode: z.enum(["test", "live"]),
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  orderMerchantOrderNumber: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  amount: z.number().int().nonnegative(),
  refundedAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  refundedAt: z.string().datetime({ offset: true }),
});
