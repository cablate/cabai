import { z } from "zod";

export const portalSchema = z.object({
  subscriptionId: z.string().optional(),
});

export type PortalInput = z.infer<typeof portalSchema>;
