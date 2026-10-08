import { z } from "zod";

export const checkoutSchema = z.object({
  // NOT z.uuid(): plans.id is "Portaly planId OR local UUID" (see schema.ts),
  // so a strict UUID check would reject every Portaly-id plan's checkout.
  // The handler looks the id up against a text column and returns a clean 404
  // when absent, so an invalid id is already harmless — we only bound the
  // length to reject pathological input.
  planId: z.string().min(1, "planId is required").max(128),
  amount: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
