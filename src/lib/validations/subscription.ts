import { z } from "zod";

export const cancelSubscriptionSchema = z.object({
  reason: z.string().max(200).optional(),
  reasonNote: z.string().max(500).optional(),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
